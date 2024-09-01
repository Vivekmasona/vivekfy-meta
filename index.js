const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Function to download and serve audio
async function downloadAndServeAudio(downloadUrl, title, res) {
    try {
        // Download the audio file directly from the streaming URL
        const audioResponse = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
        const outputFileName = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.mp3`;

        // Stream the audio file directly to the client
        res.setHeader('Content-Disposition', `attachment; filename="${outputFileName}"`);
        res.setHeader('Content-Type', 'audio/mpeg');
        res.send(audioResponse.data);
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

    // Extract video ID from YouTube URL
    const videoId = extractVideoId(youtubeUrl);

    try {
        // Fetch metadata and audio streaming URL
        const metadataApiUrl = `https://vivekfy.vercel.app/yt?videoId=${videoId}`;
        const streamApiUrl = `https://vivekfy.vercel.app/stream?url=${encodeURIComponent(youtubeUrl)}`;

        // Fetch metadata
        const metadataResponse = await axios.get(metadataApiUrl);
        const { title } = metadataResponse.data;

        // Download and serve audio
        await downloadAndServeAudio(streamApiUrl, title, res);
    } catch (error) {
        console.error('Error fetching metadata or downloading audio: ', error);
        res.status(500).send('Error fetching metadata or downloading audio.');
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
