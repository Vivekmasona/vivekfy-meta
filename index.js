const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const express = require('express');
const stream = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;

// Function to process audio with metadata and stream it back
async function processAndStreamAudio(apiUrl, coverUrl, title, artist, res) {
    try {
        // Fetch audio stream from the API endpoint
        const audioResponse = await axios.get(apiUrl, { responseType: 'stream' });

        // Download the cover image
        const coverImageResponse = await axios.get(coverUrl, { responseType: 'arraybuffer' });
        const coverImagePath = 'cover.jpg';
        fs.writeFileSync(coverImagePath, coverImageResponse.data);

        // Set up a PassThrough stream for piping the FFmpeg output
        const passThroughStream = new stream.PassThrough();

        // Use FFmpeg to process the audio and add metadata
        ffmpeg()
            .input(audioResponse.data) // Use the audio stream directly
            .input(coverImagePath) // Use the cover image file
            .outputOptions([
                '-metadata', `title=${title}`, // Set the title
                '-metadata', `artist=${artist}`, // Set the artist
                '-map', '0:a', // Map the audio stream
                '-map', '1', // Map the cover image
                '-c:v', 'mjpeg', // Encode the cover image as mjpeg
                '-id3v2_version', '3', // Set ID3 version 3 for embedding cover
                '-metadata:s:v', 'title="Album cover"', // Metadata for cover
                '-metadata:s:v', 'comment="Cover (front)"' // Comment for cover
            ])
            .format('mp3') // Output format
            .on('start', () => {
                console.log('FFmpeg processing started.');
            })
            .on('end', () => {
                console.log('Metadata added successfully and streamed to client!');
                fs.unlinkSync(coverImagePath); // Clean up the cover image file
            })
            .on('error', (err) => {
                console.error('Error processing audio with metadata:', err);
                res.status(500).send('Error processing audio with metadata.');
                fs.unlinkSync(coverImagePath); // Clean up the cover image file in case of error
            })
            .pipe(passThroughStream); // Pipe FFmpeg output to the PassThrough stream

        // Set response headers
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${title.replace(/[^a-zA-Z0-9]/g, '_')}_with_metadata.mp3"`);

        // Pipe the FFmpeg output to the HTTP response
        passThroughStream.pipe(res);

    } catch (error) {
        console.error('Error during processing:', error);
        res.status(500).send('An error occurred while processing the audio.');
    }
}

// Endpoint to handle audio download request
app.get('/download', async (req, res) => {
    const youtubeUrl = req.query.url;

    if (!youtubeUrl) {
        return res.status(400).send('Error: YouTube URL is required as a query parameter!');
    }

    // Extract the video ID from the YouTube URL
    const videoId = extractVideoId(youtubeUrl);
    const metadataApiUrl = `https://vivekfy.vercel.app/yt?videoId=${videoId}`;

    try {
        // Fetch metadata from the JSON API
        const metadataResponse = await axios.get(metadataApiUrl);
        const { title, artist, thumbnail } = metadataResponse.data;
        const coverUrl = thumbnail;

        // Construct the API URL for audio stream
        const apiUrl = `https://vivekfy.vercel.app/vivekfy?url=${encodeURIComponent(youtubeUrl)}`;

        // Process and stream the audio with metadata directly to the client
        await processAndStreamAudio(apiUrl, coverUrl, title, artist, res);
    } catch (error) {
        console.error('Error fetching metadata: ', error);
        res.status(500).send('Error fetching metadata.');
    }
});

// Utility function to extract video ID from YouTube URL
function extractVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
