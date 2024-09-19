const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const express = require('express');
const path = require('path');
const { PassThrough } = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;

// Function to stream audio data
function streamAudio(apiUrl, res) {
    const audioStream = ffmpeg()
        .input(apiUrl)
        .audioBitrate(48) // Set audio bitrate to 48kbps
        .format('mp3')
        .pipe(new PassThrough(), { end: true });

    audioStream.pipe(res);
}

// Function to process and add metadata asynchronously
async function processMetadata(apiUrl, coverUrl, title, artist) {
    try {
        const coverImageResponse = await axios.get(coverUrl, { responseType: 'arraybuffer' });
        const coverImagePath = 'cover.jpg';
        fs.writeFileSync(coverImagePath, coverImageResponse.data);

        // Set final output file name
        const finalOutputName = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_with_metadata.mp3`;

        // Use FFmpeg to process the audio and add metadata directly from the stream
        ffmpeg()
            .input(apiUrl)
            .audioBitrate(48) // Set audio bitrate to 48kbps
            .input(coverImagePath)
            .outputOptions([
                '-metadata', `title=${title}`,
                '-metadata', `artist=${artist}`,
                '-map', '0:a',
                '-map', '1:v',
                '-c:v', 'mjpeg'
            ])
            .save(finalOutputName)
            .on('end', () => {
                // Clean up temporary files
                fs.unlinkSync(coverImagePath);
                console.log(`Metadata processed for: ${finalOutputName}`);
            })
            .on('error', (err) => {
                console.error('Error adding metadata: ', err);
            });
    } catch (error) {
        console.error('Error:', error);
    }
}

// Endpoint to handle audio processing and metadata addition
app.get('/download', async (req, res) => {
    const youtubeUrl = req.query.url;

    if (!youtubeUrl) {
        return res.status(400).send('Error: YouTube URL is required as a query parameter!');
    }

    const videoId = extractVideoId(youtubeUrl);
    const metadataApiUrl = `https://vivekfy.vercel.app/vid?id=${videoId}`;

    try {
        // Fetch metadata from the JSON API
        const metadataResponse = await axios.get(metadataApiUrl);
        const { title, artist, thumbnail } = metadataResponse.data;
        const coverUrl = thumbnail;

        // Construct the API URL for audio stream
        const apiUrl = `https://vivekfy.vercel.app/vivekfy?url=${encodeURIComponent(youtubeUrl)}`;

        // Start streaming the audio file to the client
        res.setHeader('Content-Disposition', 'attachment; filename="audio.mp3"');
        res.setHeader('Content-Type', 'audio/mpeg');

        // Stream the audio
        streamAudio(apiUrl, res);

        // Process metadata in the background
        processMetadata(apiUrl, coverUrl, title, artist);
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
