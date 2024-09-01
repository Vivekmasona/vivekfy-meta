const express = require('express');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Endpoint to download audio from YouTube URL
app.get('/download', async (req, res) => {
  const youtubeUrl = req.query.url;

  if (!youtubeUrl) {
    return res.status(400).send('Error: YouTube URL is required as a query parameter!');
  }

  try {
    // Replace with your API endpoint to get the YouTube audio stream URL
    const audioApiUrl = `https://vivekfy.vercel.app/vivekfy?url=${encodeURIComponent(youtubeUrl)}`;
    
    // Fetch audio stream URL
    const response = await axios.get(audioApiUrl);
    const audioStreamUrl = response.data.url; // Adjust according to actual response structure

    if (!audioStreamUrl) {
      return res.status(500).send('Error: Unable to retrieve audio stream URL!');
    }

    // Metadata
    const title = 'mysong';
    const artist = 'vivekfy';
    const coverUrl = `https://img.youtube.com/vi/${extractVideoId(youtubeUrl)}/hqdefault.jpg`;

    // Download audio stream and save to file
    const outputFilePath = path.join(__dirname, `${title}.mp3`);
    ffmpeg(audioStreamUrl)
      .audioCodec('libmp3lame')
      .on('end', () => {
        console.log('Download complete.');

        // Send the audio file and metadata to the user
        res.set({
          'Content-Disposition': `attachment; filename="${title}.mp3"`,
          'Content-Type': 'audio/mpeg',
          'X-Title': title,
          'X-Artist': artist,
          'X-Cover': coverUrl
        });
        
        res.sendFile(outputFilePath, (err) => {
          if (err) {
            console.error('Error sending file:', err);
            res.status(500).send('Error sending file.');
          } else {
            // Clean up the file after sending
            fs.unlinkSync(outputFilePath);
          }
        });
      })
      .on('error', (err) => {
        console.error('Error processing audio:', err);
        res.status(500).send('Error processing audio.');
      })
      .save(outputFilePath);

  } catch (error) {
    console.error('Error fetching audio stream:', error);
    res.status(500).send('Error fetching audio stream.');
  }
});

// Utility function to extract video ID from YouTube URL
function extractVideoId(url) {
  const regex = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i;
  const match = url.match(regex);
  return match ? match[1] : null;
}

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
