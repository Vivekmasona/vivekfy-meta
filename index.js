const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Function to process and stream audio with metadata
async function streamAudioWithMetadata(apiUrl, coverUrl, title, artist, res) {
    try {
        // Fetch audio stream from your API endpoint
        const audioResponse = await axios.get(apiUrl, { responseType: 'stream' });

        // Download the cover image
        const coverImageResponse = await axios.get(coverUrl, { responseType: 'arraybuffer' });
        const coverImagePath = 'cover.jpg';
        fs.writeFileSync(coverImagePath, coverImageResponse.data);

        // Use FFmpeg to add metadata to the audio file
        ffmpeg()
            .input(audioResponse.data)
            .input(coverImagePath)
            .outputOptions([
                '-metadata', `title=${title}`,
                '-metadata', `artist=${artist}`,
                '-map', '0:a',
                '-map', '1:v',
                '-c:v', 'mjpeg',
            ])
            .format('mp3') // Set the output format to mp3
            .on('end', () => {
                console.log('Metadata added successfully and streamed to client!');
                // Clean up the cover image after streaming
                fs.unlinkSync(coverImagePath);
            })
            .on('error', (err) => {
                console.error('Error processing audio with metadata:', err);
                res.status(500).send('Error processing audio with metadata.');
                // Clean up the cover image in case of an error
                fs.unlinkSync(coverImagePath);
            })
            .pipe(res, { end: true }); // Pipe the output directly to the response

    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('An error occurred.');
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

        // Stream the audio with metadata directly to the client
        await streamAudioWithMetadata(apiUrl, coverUrl, title, artist, res);
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
