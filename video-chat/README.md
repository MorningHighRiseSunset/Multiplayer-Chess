# Video Chat Module

A standalone WebRTC video chat module using PeerJS for peer-to-peer video and audio communication.

## Components

### Files
- `video-chat.js` - Main JavaScript module with video chat functionality
- `video-chat.css` - Styling for video chat components
- `video-chat.html` - Standalone HTML template (for testing)
- `README.md` - This documentation file

## Features

- **Peer-to-Peer Video Chat**: Uses WebRTC via PeerJS for direct browser-to-browser connections
- **Video/Audio Controls**: Toggle camera and microphone on/off
- **URL-Based Connection**: Share your URL with opponent to establish connection
- **Responsive Design**: Works on desktop and mobile devices
- **Error Handling**: Graceful error handling and user feedback

## Dependencies

- **PeerJS**: https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js
- **Browser Support**: Modern browsers with WebRTC support

## Integration

### 1. Include Dependencies
```html
<script src="https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js"></script>
```

### 2. Include CSS
```html
<link rel="stylesheet" href="video-chat/video-chat.css">
```

### 3. Include JavaScript
```html
<script src="video-chat/video-chat.js"></script>
```

### 4. Add HTML Structure
```html
<div class="video-container">
  <div class="video-content">
    <div class="video-grid-stacked">
      <div class="video-item">
        <div class="video-wrapper">
          <video id="local-video" autoplay muted playsinline></video>
          <div id="local-placeholder" class="video-placeholder">
            <div class="placeholder-icon">👤</div>
            <div class="placeholder-text">Your Camera</div>
          </div>
        </div>
        <div class="video-label">You</div>
      </div>
      
      <div class="video-item">
        <div class="video-wrapper">
          <video id="remote-video" autoplay playsinline></video>
          <div id="remote-placeholder" class="video-placeholder">
            <div class="placeholder-icon">👤</div>
            <div class="placeholder-text">Waiting for opponent...</div>
          </div>
        </div>
        <div class="video-label">Opponent</div>
      </div>
    </div>
    
    <div class="video-controls-bottom">
      <button id="start-video-btn" class="video-control-btn" title="Start Video Chat">📹 Start</button>
      <button id="toggle-video-btn" class="video-control-btn" title="Toggle Video" style="display:none;">🔴</button>
      <button id="toggle-audio-btn" class="video-control-btn" title="Toggle Audio" style="display:none;">🔊</button>
      <button id="leave-video-btn" class="video-control-btn danger" title="Leave Video Chat" style="display:none;">❌</button>
    </div>
    
    <div id="video-status" class="video-status">Click Start to begin video chat</div>
  </div>
</div>
```

## Usage

### Starting Video Chat
1. Click the "📹 Start" button
2. Allow browser camera/microphone permissions
3. Share your URL (now includes peer ID) with opponent
4. Opponent opens the URL to establish connection

### Controls
- **📹 Start**: Initialize video chat and get peer ID
- **🔴**: Toggle camera on/off
- **🔊**: Toggle microphone on/off
- **❌**: Leave video chat and cleanup

## API Functions

The module exports these functions for programmatic control:

```javascript
// Initialize button event listeners
initializeVideoChatButtons();

// Start video chat
startVideoChat();

// Stop video chat
stopVideoChat();

// Toggle video
toggleVideo();

// Toggle audio
toggleAudio();
```

## URL Parameters

- `?peer=PEER_ID`: Connect to specific peer by ID

## Browser Requirements

- WebRTC support
- Camera and microphone access
- HTTPS (required for WebRTC in production)

## Security Notes

- Uses peer-to-peer connections (no server storage of video)
- Requires user permission for camera/microphone
- Connection is direct between browsers
- Consider adding authentication for production use

## Customization

### Styling
Modify `video-chat.css` to match your application's theme:

```css
.video-container {
  background: #your-color;
  border: your-border-style;
}
```

### Video Quality
Adjust video resolution in `video-chat.js`:

```javascript
localStream = await navigator.mediaDevices.getUserMedia({
  video: { width: 640, height: 480 }, // Higher quality
  audio: true
});
```

## Testing

Open `video-chat.html` in two browser windows to test the video chat functionality:
1. Click "Start" in first window
2. Copy the URL with peer ID
3. Open URL in second window
4. Video connection should establish automatically

## Troubleshooting

### Connection Issues
- Ensure both users have the same peer ID in URL
- Check browser console for PeerJS errors
- Verify network connectivity
- Ensure HTTPS in production

### Camera/Microphone Issues
- Check browser permissions
- Verify device is not in use by another application
- Try different browser

### Mobile Issues
- Ensure mobile browser supports WebRTC
- Check device permissions
- Test on stable network connection

## License

This module is part of the Multiplayer Checkers project.
