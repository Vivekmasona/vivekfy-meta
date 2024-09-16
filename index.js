const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Function to download audio and add metadata with progress
async function downloadAudioWithMetadata(apiUrl, coverUrl, title, res, fullBackendUrl) {
    try {
        const audioFilePath = 'audio.mp3';
        const coverImagePath = 'cover.jpg';
        const outputFileName = `${title}.mp3`;

        // Fetch audio from the direct download API endpoint and save it to a temporary file
        const audioResponse = await axios.get(apiUrl, { responseType: 'stream' });
        const audioFileStream = fs.createWriteStream(audioFilePath);

        // Pipe the audio stream directly to the file
        audioResponse.data.pipe(audioFileStream);

        audioFileStream.on('finish', async () => {
            console.log('Audio downloaded successfully!');

            try {
                // Download the cover image
                const coverImageResponse = await axios.get(coverUrl, { responseType: 'arraybuffer' });
                fs.writeFileSync(coverImagePath, coverImageResponse.data);

                // Use FFmpeg to add metadata to the audio file with progress
                const command = ffmpeg()
                    .input(audioFilePath)
                    .input(coverImagePath)
                    .outputOptions([
                        '-metadata', `title=${title}`,
                        '-metadata', 'artist=VivekMasona',
                        '-map', '0:a',
                        '-map', '1:v',
                        '-c:v', 'mjpeg',
                    ])
                    .save(outputFileName);

                // Listen for FFmpeg progress events
                command.on('progress', (progress) => {
                    const progressPercentage = (progress.percent || 0).toFixed(2);
                    console.log(`Progress: ${progressPercentage}%`);
                    // You can optionally send this progress percentage back to the client in real-time
                    res.write(`Progress: ${progressPercentage}%\n`);
                });

                // When FFmpeg finishes adding metadata
                command.on('end', () => {
                    console.log('Metadata added successfully!');

                    // Generate the full URL for the download
                    const downloadUrl = `${fullBackendUrl}/download/${encodeURIComponent(outputFileName)}`;

                    // Send the download URL back to the client
                    res.write(`Download ready at: ${downloadUrl}\n`);
                    res.end();

                    // Clean up files after sending the download URL
                    cleanUpFiles([audioFilePath, coverImagePath]);
                });

                // Handle errors during FFmpeg processing
                command.on('error', (err) => {
                    console.error('Error adding metadata: ', err);
                    res.status(500).send('Error adding metadata.');
                    cleanUpFiles([audioFilePath, outputFileName, coverImagePath]);
                });

            } catch (coverError) {
                console.error('Error downloading cover image:', coverError);
                res.status(500).send('Error downloading cover image.');
                cleanUpFiles([audioFilePath]);
            }
        });

        // Handle errors during audio download
        audioFileStream.on('error', (err) => {
            console.error('Error writing audio file:', err);
            res.status(500).send('Error writing audio file.');
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('An error occurred.');
    }
}

// Utility function to clean up files
function cleanUpFiles(files) {
    files.forEach(file => {
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
    });
}

// Endpoint to handle audio download request
app.get('/download', async (req, res) => {
    const youtubeUrl = req.query.url;
    const title = req.query.title || 'Unknown Title';  // Title passed via query

    if (!youtubeUrl) {
        return res.status(400).send('Error: YouTube URL is required as a query parameter!');
    }

    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
        return res.status(400).send('Error: Invalid YouTube URL!');
    }

    // Generate cover image URL using the video ID
    const coverUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    // Use the new API for direct audio download
    const apiUrl = `https://vivekfy.vercel.app/stream?url=${encodeURIComponent(youtubeUrl)}`;

    // Get the full URL for this server
    const fullBackendUrl = `${req.protocol}://${req.get('host')}`;

    // Call the function to download the audio and attach metadata
    res.write('Starting the download...\n');
    await downloadAudioWithMetadata(apiUrl, coverUrl, title, res, fullBackendUrl);
});

// Serve the generated mp3 files for download
app.get('/download/:file', (req, res) => {
    const fileName = req.params.file;
    const filePath = path.join(__dirname, fileName);

    if (fs.existsSync(filePath)) {
        res.download(filePath, (err) => {
            if (err) {
                console.error('Error sending the file:', err);
            }

            // Clean up the file after sending
            fs.unlinkSync(filePath);
        });
    } else {
        res.status(404).send('File not found.');
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
