export const ShaderEffects = {
  // GLSL snippet generating radial speed line streaks shooting inwards from screen borders
  speedLines: `
    float getSpeedLines(vec2 uv, float time, float speed) {
      vec2 center = vec2(0.5);
      vec2 dir = uv - center;
      float dist = length(dir);
      
      // Compute polar angle relative to center of screen
      float angle = atan(dir.y, dir.x);
      
      // High-frequency sin/cos waves for random radial streaks
      float streak = sin(angle * 140.0 + time * 18.0) * sin(angle * 60.0 - time * 28.0);
      streak = smoothstep(0.75, 1.0, streak);
      
      // Fades out streaks towards the center (only active near edges)
      float edgeFade = smoothstep(0.35, 0.72, dist);
      
      // Scales with normalized vehicle speed
      return streak * edgeFade * smoothstep(0.4, 1.0, speed);
    }
  `
};
