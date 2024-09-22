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
        const coverImageResponse = await axios.get(coverUrl, { responseType: 'arraybuffer' });
        const coverImagePath = 'cover.jpg';
        fs.writeFileSync(coverImagePath, coverImageResponse.data);

        const finalOutputName = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_with_metadata.mp3`;

        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(apiUrl)
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
                    fs.unlinkSync(coverImagePath); // Clean up temporary files
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
        throw new Error('An error occurred during processing.');
    }
}

// Serve HTML directly from backend
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Audio Processor</title>
        <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            #progress { display: none; }
            #download-link { display: none; margin-top: 20px; }
        </style>
    </head>
    <body>
        <h1>Process YouTube Audio with Metadata</h1>
        <label for="url">YouTube URL:</label>
        <input type="text" id="url" placeholder="Enter YouTube URL">
        <button id="processBtn">Process Audio</button>

        <div id="progress">Processing audio... Please wait.</div>
        <div id="download-link">
            <a id="downloadAnchor" href="#" download>Download Processed Audio</a>
        </div>

        <script>
            document.getElementById('processBtn').addEventListener('click', async function() {
                const url = document.getElementById('url').value;
                if (!url) {
                    alert('Please enter a YouTube URL.');
                    return;
                }

                document.getElementById('progress').style.display = 'block';
                document.getElementById('download-link').style.display = 'none';

                try {
                    const response = await fetch(\`/download?url=\${encodeURIComponent(url)}\`);
                    const data = await response.json();
                    document.getElementById('progress').style.display = 'none';

                    const downloadAnchor = document.getElementById('downloadAnchor');
                    downloadAnchor.href = data.downloadUrl;
                    downloadAnchor.click();
                } catch (error) {
                    document.getElementById('progress').innerHTML = 'Error processing audio. Please try again.';
                    console.error('Error:', error);
                }
            });
        </script>
    </body>
    </html>
    `);
});

// Endpoint to handle audio processing and metadata addition
app.get('/download', async (req, res) => {
    const youtubeUrl = req.query.url;

    if (!youtubeUrl) {
        return res.status(400).send('Error: YouTube URL is required as a query parameter!');
    }

    const videoId = extractVideoId(youtubeUrl);
    const metadataApiUrl = `https://vivekfy.vercel.app/vid?id=${videoId}`;

    try {
        const metadataResponse = await axios.get(metadataApiUrl);
        const { title, artist, thumbnail } = metadataResponse.data;
        const coverUrl = thumbnail;

        const apiUrl = `https://vivekfy.vercel.app/vivekfy?url=${encodeURIComponent(youtubeUrl)}`;

        // Process audio and add metadata
        const filePath = await processAudioWithMetadata(apiUrl, coverUrl, title, artist);

        // Return the download URL in JSON response
        res.json({ downloadUrl: `${req.protocol}://${req.get('host')}/files/${path.basename(filePath)}` });
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

// Serve files from the /files directory
app.use('/files', express.static(__dirname));

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
