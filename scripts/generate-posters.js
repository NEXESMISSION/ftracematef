/**
 * Poster Generation Script for TraceMate
 * 
 * This script automatically generates poster images for all videos in the project.
 * It creates high-quality JPEG thumbnails that can be used as poster images for videos,
 * which significantly improves perceived loading performance.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Check if ffmpeg is installed
try {
  execSync('ffmpeg -version', { stdio: 'ignore' });
  console.log('✅ ffmpeg is installed');
} catch (error) {
  console.error('❌ ffmpeg is not installed. Please install it to use this script.');
  console.log('Installation instructions: https://ffmpeg.org/download.html');
  process.exit(1);
}

// Paths
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ASSETS_DIR = path.join(PUBLIC_DIR, 'assests');
const VIDEOS_DIR = path.join(ASSETS_DIR, 'vedios of how it works');
const POSTERS_DIR = path.join(ASSETS_DIR, 'posters');

// Create directories if they don't exist
if (!fs.existsSync(POSTERS_DIR)) {
  fs.mkdirSync(POSTERS_DIR, { recursive: true });
  console.log(`Created directory: ${POSTERS_DIR}`);
}

/**
 * Find all video files recursively in a directory
 * @param {string} dir - Directory to search
 * @param {Array} fileList - Accumulator for found files
 * @returns {Array} List of video file paths
 */
const findVideoFiles = (dir, fileList = []) => {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      findVideoFiles(filePath, fileList);
    } else {
      const ext = path.extname(file).toLowerCase();
      if (['.mp4', '.webm', '.mov'].includes(ext)) {
        fileList.push(filePath);
      }
    }
  });
  
  return fileList;
};

/**
 * Generate a poster image from a video file
 * @param {string} videoPath - Path to the video file
 * @param {string} outputPath - Path to save the poster image
 * @param {number} timeOffset - Time offset in seconds to capture the frame
 * @returns {boolean} Success status
 */
const generatePoster = (videoPath, outputPath, timeOffset = 1) => {
  try {
    // Extract frame at specified time offset
    execSync(`ffmpeg -i "${videoPath}" -ss 00:00:0${timeOffset}.000 -vframes 1 -q:v 2 "${outputPath}" -y`);
    console.log(`✅ Generated poster: ${outputPath}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to generate poster for ${videoPath}:`, error.message);
    return false;
  }
};

// Process main video
const mainVideo = path.join(ASSETS_DIR, 'main.mp4');
if (fs.existsSync(mainVideo)) {
  console.log('Processing main video...');
  const mainPoster = path.join(ASSETS_DIR, 'poster-main.jpg');
  generatePoster(mainVideo, mainPoster);
}

// Find and process all videos in the assets directory
console.log('Searching for videos in assets directory...');
try {
  const videoFiles = findVideoFiles(ASSETS_DIR);
  console.log(`Found ${videoFiles.length} video files.`);
  
  // Process each video
  let successCount = 0;
  videoFiles.forEach((videoPath, index) => {
    const relativePath = path.relative(ASSETS_DIR, videoPath);
    const fileName = path.basename(videoPath, path.extname(videoPath));
    const dirName = path.dirname(relativePath);
    
    // Create poster directory if needed
    const posterDir = path.join(POSTERS_DIR, dirName);
    if (!fs.existsSync(posterDir)) {
      fs.mkdirSync(posterDir, { recursive: true });
    }
    
    // Generate poster path
    let posterPath;
    if (dirName === '.') {
      posterPath = path.join(POSTERS_DIR, `${fileName}.jpg`);
    } else if (dirName === 'vedios of how it works') {
      posterPath = path.join(POSTERS_DIR, `tutorial-${fileName}.jpg`);
    } else {
      posterPath = path.join(POSTERS_DIR, dirName, `${fileName}.jpg`);
    }
    
    // Generate poster
    console.log(`Processing video ${index + 1}/${videoFiles.length}: ${relativePath}`);
    if (generatePoster(videoPath, posterPath)) {
      successCount++;
    }
  });
  
  console.log(`✨ Poster generation complete! Generated ${successCount}/${videoFiles.length} posters.`);
} catch (error) {
  console.error('Error processing videos:', error.message);
  process.exit(1);
}
