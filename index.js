const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// YouTube Data API key
const YOUTUBE_API_KEY = 'AIzaSyBh6s9emY3VYSbsHudlhxProRt8mtFyt2s';

// Function to download audio and add metadata
async function downloadAudioWithMetadata(apiUrl, coverUrl, title, artist, res) {
    try {
        // Fetch audio stream from your API endpoint and save it to a temporary file
        const audioResponse = await axios.get(apiUrl, { responseType: 'stream' });
        const audioFilePath = path.join(__dirname, 'audio.mp3');
        const audioFileStream = fs.createWriteStream(audioFilePath);

        audioResponse.data.pipe(audioFileStream);

        audioFileStream.on('finish', async () => {
            console.log('Audio downloaded successfully!');

            try {
                // Download the cover image
                const coverImageResponse = await axios.get(coverUrl, { responseType: 'arraybuffer' });
                const coverImagePath = path.join(__dirname, 'cover.jpg');
                fs.writeFileSync(coverImagePath, coverImageResponse.data);

                // Set output file name
                const outputFileName = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_with_metadata.mp3`;
                const outputFilePath = path.join(__dirname, outputFileName);

                // Use FFmpeg to add metadata to the audio file
                ffmpeg()
                    .input(audioFilePath)
                    .input(coverImagePath)
                    .outputOptions([
                        '-metadata', `title=${title}`,
                        '-metadata', `artist=${artist}`,
                        '-map', '0:a',
                        '-map', '1:v',
                        '-c:v', 'mjpeg'
                    ])
                    .save(outputFilePath)
                    .on('end', () => {
                        console.log('Metadata added successfully!');

                        // Send the modified file to the client
                        res.download(outputFilePath, () => {
                            // Clean up files after download
                            fs.unlinkSync(audioFilePath);
                            fs.unlinkSync(outputFilePath);
                            fs.unlinkSync(coverImagePath);
                        });
                    })
                    .on('error', (err) => {
                        console.error('Error adding metadata: ', err);
                        res.status(500).send('Error adding metadata.');
                    });
            } catch (err) {
                console.error('Error downloading cover image:', err);
                res.status(500).send('Error downloading cover image.');
            }
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

    // Extract video ID from the provided URL
    const videoId = extractVideoId(youtubeUrl);

    if (!videoId) {
        return res.status(400).send('Invalid YouTube URL!');
    }

    // Fetch metadata using YouTube Data API
    const youtubeApiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${YOUTUBE_API_KEY}&part=snippet`;

    try {
        // Fetch metadata from the YouTube API
        const metadataResponse = await axios.get(youtubeApiUrl);
        const videoDetails = metadataResponse.data.items[0];

        if (!videoDetails) {
            return res.status(404).send('Video not found.');
        }

        const title = videoDetails.snippet.title;
        const artist = videoDetails.snippet.channelTitle; // Using the channel title as artist
        const coverUrl = videoDetails.snippet.thumbnails.high.url; // High-quality thumbnail

        // Construct the API URL for audio stream
        const apiUrl = `https://vivekfy.vercel.app/vivekfy?url=${encodeURIComponent(youtubeUrl)}`;

        await downloadAudioWithMetadata(apiUrl, coverUrl, title, artist, res);
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
