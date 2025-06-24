const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Video optimization script using FFmpeg
// This script will create optimized versions of your videos

const videoConfigs = {
  // High quality for hero video (still compressed)
  hero: {
    input: 'public/assets/main.mp4',
    output: 'public/assets/main-optimized.mp4',
    quality: 'high',
    maxSize: '5MB'
  },
  // Medium quality for tutorial videos
  tutorial: {
    input: 'public/assets/vedios of how it works/',
    output: 'public/assets/vedios of how it works/optimized/',
    quality: 'medium',
    maxSize: '1MB'
  }
};

// FFmpeg commands for different quality levels
const ffmpegCommands = {
  high: {
    video: '-c:v libx264 -crf 23 -preset fast -movflags +faststart',
    audio: '-c:a aac -b:a 128k'
  },
  medium: {
    video: '-c:v libx264 -crf 28 -preset fast -movflags +faststart',
    audio: '-c:a aac -b:a 96k'
  },
  low: {
    video: '-c:v libx264 -crf 32 -preset fast -movflags +faststart',
    audio: '-c:a aac -b:a 64k'
  }
};

function optimizeVideo(inputPath, outputPath, quality = 'medium') {
  return new Promise((resolve, reject) => {
    const config = ffmpegCommands[quality];
    const command = `ffmpeg -i "${inputPath}" ${config.video} ${config.audio} -y "${outputPath}"`;
    
    console.log(`Optimizing: ${inputPath} -> ${outputPath}`);
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error optimizing ${inputPath}:`, error);
        reject(error);
        return;
      }
      
      // Get file sizes
      const originalSize = fs.statSync(inputPath).size;
      const optimizedSize = fs.statSync(outputPath).size;
      const compressionRatio = ((originalSize - optimizedSize) / originalSize * 100).toFixed(1);
      
      console.log(`✅ Optimized: ${inputPath}`);
      console.log(`   Original: ${(originalSize / 1024 / 1024).toFixed(2)}MB`);
      console.log(`   Optimized: ${(optimizedSize / 1024 / 1024).toFixed(2)}MB`);
      console.log(`   Compression: ${compressionRatio}%`);
      
      resolve();
    });
  });
}

async function optimizeAllVideos() {
  try {
    console.log('🎬 Starting video optimization...');
    
    // Create optimized directory if it doesn't exist
    const optimizedDir = 'public/assets/vedios of how it works/optimized';
    if (!fs.existsSync(optimizedDir)) {
      fs.mkdirSync(optimizedDir, { recursive: true });
    }
    
    // Optimize hero video
    await optimizeVideo(
      videoConfigs.hero.input,
      videoConfigs.hero.output,
      videoConfigs.hero.quality
    );
    
    // Optimize tutorial videos
    const tutorialDir = videoConfigs.tutorial.input;
    const files = fs.readdirSync(tutorialDir).filter(file => file.endsWith('.mp4'));
    
    for (const file of files) {
      const inputPath = path.join(tutorialDir, file);
      const outputPath = path.join(optimizedDir, file.replace('.mp4', '-optimized.mp4'));
      
      await optimizeVideo(inputPath, outputPath, videoConfigs.tutorial.quality);
    }
    
    console.log('🎉 All videos optimized successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Update your video references to use the optimized versions');
    console.log('2. Consider implementing WebM format for even better compression');
    console.log('3. Add preload hints in your HTML head');
    
  } catch (error) {
    console.error('❌ Video optimization failed:', error);
  }
}

// Run the optimization
if (require.main === module) {
  optimizeAllVideos();
}

module.exports = { optimizeVideo, optimizeAllVideos }; 