/**
 * Utility to generate placeholder images for videos
 * This can be used to create placeholder images during build time
 */

/**
 * Generate a placeholder image data URL with text
 * @param width Width of the placeholder
 * @param height Height of the placeholder
 * @param text Text to display on the placeholder
 * @param bgColor Background color
 * @param textColor Text color
 * @returns Data URL of the generated placeholder image
 */
export function generatePlaceholder(
  width: number = 640,
  height: number = 360,
  text: string = 'Loading...',
  bgColor: string = '#111111',
  textColor: string = '#ffffff'
): string {
  // Create a canvas element
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  
  // Get the context
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  
  // Fill background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);
  
  // Add text
  ctx.fillStyle = textColor;
  ctx.font = `bold ${Math.floor(width / 20)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2);
  
  // Return as data URL
  return canvas.toDataURL('image/jpeg', 0.7);
}

/**
 * Generate a gradient placeholder image
 * @param width Width of the placeholder
 * @param height Height of the placeholder
 * @param colors Array of colors for the gradient
 * @returns Data URL of the generated gradient placeholder
 */
export function generateGradientPlaceholder(
  width: number = 640,
  height: number = 360,
  colors: string[] = ['#3b82f6', '#8b5cf6']
): string {
  // Create a canvas element
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  
  // Get the context
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  
  // Create gradient
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  colors.forEach((color, index) => {
    gradient.addColorStop(index / (colors.length - 1), color);
  });
  
  // Fill with gradient
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  // Return as data URL
  return canvas.toDataURL('image/jpeg', 0.7);
}
