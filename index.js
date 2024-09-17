const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Function to process audio and add metadata
async function processAudioWithMetadata(apiUrl, coverUrl, title, artist) {
    try {
        // Fetch audio stream from your API endpoint
        const audioResponse = await axios.get(apiUrl, { responseType: 'stream' });
        const audioFilePath = 'temp_audio.mp3';
        
        // Save audio blob to a temporary file
        await new Promise((resolve, reject) => {
            const writer = fs.createWriteStream(audioFilePath);
            audioResponse.data.pipe(writer);
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // Download the cover image
        const coverImageResponse = await axios.get(coverUrl, { responseType: 'arraybuffer' });
        const coverImagePath = 'cover.jpg';
        fs.writeFileSync(coverImagePath, coverImageResponse.data);

        // Set final output file name
        const finalOutputName = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_with_metadata.mp3`;

        // Use FFmpeg to add metadata
        await new Promise((resolve, reject) => {
            ffmpeg(audioFilePath)
                .audioBitrate(128)
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
                    fs.unlinkSync(audioFilePath);
                    fs.unlinkSync(coverImagePath);
                    resolve(finalOutputName);
                })
                .on('error', (err) => {
                    console.error('Error adding metadata: ', err);
                    reject(err);
                });
        });

        return path.join(__dirname, finalOutputName);
    } catch (error) {
        console.error('Error:', error);
        throw new Error('An error occurred.');
    }
}

// Endpoint to handle audio processing and metadata addition
app.get('/download', async (req, res) => {
    const youtubeUrl = req.query.url;

    if (!youtubeUrl) {
        return res.status(400).send('Error: YouTube URL is required as a query parameter!');
    }

    const videoId = extractVideoId(youtubeUrl);
    const metadataApiUrl = `https://vivekfy.vercel.app/yt?videoId=${videoId}`;

    try {
        // Fetch metadata from the JSON API
        const metadataResponse = await axios.get(metadataApiUrl);
        const { title, artist, thumbnail } = metadataResponse.data;
        const coverUrl = thumbnail;

        // Construct the API URL for audio stream
        const apiUrl = `https://vivekfy.vercel.app/vivekfy?url=${encodeURIComponent(youtubeUrl)}`;

        // Process audio and add metadata
        const filePath = await processAudioWithMetadata(apiUrl, coverUrl, title, artist);

        // Set headers for file download
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
        res.setHeader('Content-Type', 'audio/mpeg');

        // Stream the file to the response
        const readStream = fs.createReadStream(filePath);
        readStream.pipe(res);

        // Clean up the file after download
        readStream.on('end', () => {
            fs.unlinkSync(filePath);
        });

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
