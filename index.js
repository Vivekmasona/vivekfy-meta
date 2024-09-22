const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Function to process audio and add metadata with text overlay
async function processAudioWithMetadata(apiUrl, coverUrl, title, artist) {
    const coverImagePath = 'cover.jpg';
    const finalOutputName = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_with_metadata.mp3`;

    try {
        const coverImageResponse = await axios.get(coverUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(coverImagePath, coverImageResponse.data);

        return new Promise((resolve, reject) => {
            ffmpeg()
                .input(apiUrl)
                .audioBitrate(48)
                .input(coverImagePath)
                .outputOptions([
                    '-metadata', `title=${title}`,
                    '-metadata', `artist=${artist}`,
                    '-map', '0:a',
                    '-map', '1:v',
                    '-c:v', 'mjpeg',
                    '-vf', "drawtext=text='Download from vivekfy':fontcolor=white:fontsize=24:box=1:boxcolor=black@0.8:x=(W-text_w)/2:y=(H-text_h)/2"
                ])
                .save(finalOutputName)
                .on('end', () => {
                    fs.unlinkSync(coverImagePath);
                    resolve(finalOutputName);
                })
                .on('error', (err) => {
                    console.error('Error adding metadata: ', err);
                    reject(err);
                });
        });
    } catch (error) {
        console.error('Error:', error);
        throw new Error('An error occurred while processing audio.');
    }
}

// Helper function to fetch audio from both APIs
async function fetchAudio(youtubeUrl, title, artist, thumbnail) {
    const apiUrls = [
        `https://vivekfy.vercel.app/vivekfy?url=${encodeURIComponent(youtubeUrl)}`,
        `https://vivekfy.vercel.app/vivekfy2?url=${encodeURIComponent(youtubeUrl)}`
    ];

    for (const apiUrl of apiUrls) {
        try {
            return await processAudioWithMetadata(apiUrl, thumbnail, title, artist);
        } catch (error) {
            console.error(`Failed to fetch audio from ${apiUrl}: ${error.message}`);
            // Continue to the next API
        }
    }

    throw new Error('Both APIs failed to fetch audio.');
}

// Endpoint to download audio
app.get('/download', async (req, res) => {
    const { youtubeUrl } = req.query;

    if (!youtubeUrl) {
        return res.status(400).send('You must provide a YouTube URL.');
    }

    // Extract video ID to fetch metadata
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
        return res.status(400).send('Please send a valid YouTube URL.');
    }

    const metadataApiUrl = `https://vivekfy.vercel.app/vid?id=${videoId}`;
    try {
        // Fetch metadata
        const metadataResponse = await axios.get(metadataApiUrl);
        const { title, artist, thumbnail } = metadataResponse.data;

        // Fetch audio and add metadata
        const filePath = await fetchAudio(youtubeUrl, title, artist, thumbnail);

        // Send the processed file to the user
        res.download(filePath, (err) => {
            if (err) {
                console.error('Error sending file:', err);
            }
            fs.unlinkSync(filePath); // Clean up after sending the file
        });

    } catch (error) {
        console.error('Error fetching metadata or processing audio: ', error);
        res.status(500).send('Error processing the audio.');
    }
});

// Utility function to extract video ID from YouTube URL
function extractVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// Start Express server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
