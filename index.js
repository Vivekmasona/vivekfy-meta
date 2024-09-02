const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const express = require('express');
const stream = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;

// Function to download audio, add metadata, and stream it back
async function processAndStreamAudio(apiUrl, coverUrl, title, artist, res) {
    try {
        // Fetch audio stream from the API endpoint
        const audioResponse = await axios.get(apiUrl, { responseType: 'stream' });

        // Create a temporary file for the audio stream
        const audioFilePath = 'temp_audio.mp3';
        const audioFileStream = fs.createWriteStream(audioFilePath);

        // Pipe the audio stream to the temporary file
        audioResponse.data.pipe(audioFileStream);

        // Wait until the audio is fully written
        audioFileStream.on('finish', async () => {
            console.log('Audio downloaded successfully!');

            // Download the cover image
            const coverImageResponse = await axios.get(coverUrl, { responseType: 'arraybuffer' });
            const coverImagePath = 'cover.jpg';
            fs.writeFileSync(coverImagePath, coverImageResponse.data);

            // Create a PassThrough stream to pipe FFmpeg output to HTTP response
            const passThroughStream = new stream.PassThrough();

            // Use FFmpeg to add metadata to the audio file
            ffmpeg()
                .input(audioFilePath)
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
                    // Clean up the temporary files
                    fs.unlinkSync(audioFilePath);
                    fs.unlinkSync(coverImagePath);
                })
                .on('error', (err) => {
                    console.error('Error processing audio with metadata:', err);
                    res.status(500).send('Error processing audio with metadata.');
                    // Clean up in case of an error
                    fs.unlinkSync(audioFilePath);
                    fs.unlinkSync(coverImagePath);
                })
                .pipe(passThroughStream);

            // Set headers for the HTTP response
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Content-Disposition', `attachment; filename="${title.replace(/[^a-zA-Z0-9]/g, '_')}_with_metadata.mp3"`);

            // Pipe the FFmpeg output to the HTTP response
            passThroughStream.pipe(res);
        });

        audioFileStream.on('error', (err) => {
            console.error('Error writing audio file:', err);
            res.status(500).send('Error writing audio file.');
        });

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
