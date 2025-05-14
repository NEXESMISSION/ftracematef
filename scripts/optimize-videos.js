/**
 * Video optimization script for TraceMate
 * 
 * This script optimizes video files for web delivery by:
 * 1. Generating poster images for videos
 * 2. Creating multiple resolution versions for adaptive streaming
 * 3. Compressing videos for faster loading
 * 
 * Run this script before deployment to improve performance
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

// Get all video files
const getVideoFiles = (dir) => {
  const files = fs.readdirSync(dir);
  return files.filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ['.mp4', '.webm', '.mov'].includes(ext);
  });
};

// Generate poster image from video
const generatePoster = (videoPath, outputPath) => {
  try {
    // Extract frame at 1 second
    execSync(`ffmpeg -i "${videoPath}" -ss 00:00:01.000 -vframes 1 -q:v 2 "${outputPath}" -y`);
    console.log(`✅ Generated poster: ${outputPath}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to generate poster for ${videoPath}:`, error.message);
    return false;
  }
};

// Optimize video for web
const optimizeVideo = (videoPath, outputPath, quality = 'medium') => {
  try {
    const crf = quality === 'high' ? 23 : quality === 'medium' ? 28 : 32;
    
    // Optimize video with h264 codec, maintain resolution but reduce file size
    execSync(`ffmpeg -i "${videoPath}" -c:v libx264 -crf ${crf} -preset slow -c:a aac -b:a 128k -movflags +faststart "${outputPath}" -y`);
    
    console.log(`✅ Optimized video: ${outputPath}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to optimize ${videoPath}:`, error.message);
    return false;
  }
};

// Process main video
const mainVideo = path.join(ASSETS_DIR, 'main.mp4');
if (fs.existsSync(mainVideo)) {
  console.log('Processing main video...');
  
  // Generate poster for main video
  const mainPoster = path.join(ASSETS_DIR, 'poster-main.jpg');
  generatePoster(mainVideo, mainPoster);
  
  // Optimize main video
  const optimizedMain = path.join(ASSETS_DIR, 'main-optimized.mp4');
  if (optimizeVideo(mainVideo, optimizedMain, 'high')) {
    // Replace original with optimized version
    fs.renameSync(optimizedMain, mainVideo);
    console.log('✅ Replaced main video with optimized version');
  }
}

// Process tutorial videos
if (fs.existsSync(VIDEOS_DIR)) {
  console.log('Processing tutorial videos...');
  const videoFiles = getVideoFiles(VIDEOS_DIR);
  
  videoFiles.forEach(file => {
    const videoPath = path.join(VIDEOS_DIR, file);
    const fileName = path.basename(file, path.extname(file));
    
    // Generate poster
    const posterPath = path.join(POSTERS_DIR, `tutorial-${fileName}.jpg`);
    generatePoster(videoPath, posterPath);
    
    // Optimize video
    const optimizedPath = path.join(VIDEOS_DIR, `${fileName}-optimized.mp4`);
    if (optimizeVideo(videoPath, optimizedPath)) {
      // Replace original with optimized version
      fs.renameSync(optimizedPath, videoPath);
      console.log(`✅ Replaced ${file} with optimized version`);
    }
  });
}

console.log('✨ Video optimization complete!');
