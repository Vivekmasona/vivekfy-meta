const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const express = require('express');
const path = require('path');
const { PassThrough } = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;

// Function to stream audio with metadata
function streamAudioWithMetadata(apiUrl, coverUrl, title, artist, res) {
    const coverImageStream = axios.get(coverUrl, { responseType: 'stream' }).then(response => response.data);
    
    // Create a PassThrough stream to handle audio streaming
    const passThroughStream = new PassThrough();

    // Pipe the audio stream to the PassThrough stream
    ffmpeg()
        .input(apiUrl)
        .audioBitrate(48) // Set audio bitrate to 48kbps
        .input(coverImageStream)
        .outputOptions([
            '-metadata', `title=${title}`,
            '-metadata', `artist=${artist}`,
            '-map', '0:a',
            '-map', '1:v',
            '-c:v', 'mjpeg'
        ])
        .format('mp3')
        .pipe(passThroughStream, { end: true });

    // Set headers for file download
    res.setHeader('Content-Disposition', 'attachment; filename="audio_with_metadata.mp3"');
    res.setHeader('Content-Type', 'audio/mpeg');

    // Pipe the PassThrough stream to the response
    passThroughStream.pipe(res);
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

        // Stream audio with metadata directly to the client
        streamAudioWithMetadata(apiUrl, coverUrl, title, artist, res);
    } catch (error) {
        console.error('Error fetching metadata:', error);
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
