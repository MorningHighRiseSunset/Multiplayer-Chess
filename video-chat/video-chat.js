// --- Video Chat Functionality (PeerJS) ---
// This is a standalone video chat module using PeerJS for WebRTC connections
// Dependencies: PeerJS library (https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js)

let peer = null;
let localStream = null;
let currentCall = null;
let isVideoEnabled = true;
let isAudioEnabled = true;

// Video chat elements
const videoContainer = document.getElementById('video-container');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const localPlaceholder = document.getElementById('local-placeholder');
const remotePlaceholder = document.getElementById('remote-placeholder');
const videoStatus = document.getElementById('video-status');
const startVideoBtn = document.getElementById('start-video-btn');
const toggleVideoBtn = document.getElementById('toggle-video-btn');
const toggleAudioBtn = document.getElementById('toggle-audio-btn');
const leaveVideoBtn = document.getElementById('leave-video-btn');

// Get peer ID from URL or generate new one
const urlParams = new URLSearchParams(window.location.search);
const remotePeerId = urlParams.get('peer');

// Initialize video chat button event listeners
function initializeVideoChatButtons() {
  if (startVideoBtn) {
    startVideoBtn.addEventListener('click', startVideoChat);
  }
  if (toggleVideoBtn) {
    toggleVideoBtn.addEventListener('click', toggleVideo);
  }
  if (toggleAudioBtn) {
    toggleAudioBtn.addEventListener('click', toggleAudio);
  }
  if (leaveVideoBtn) {
    leaveVideoBtn.addEventListener('click', stopVideoChat);
  }
}

// Start video chat with PeerJS
async function startVideoChat() {
  console.log('[video-chat] Starting video chat with PeerJS');
  
  try {
    // Initialize PeerJS
    peer = new Peer();
    
    peer.on('open', (id) => {
      console.log('[video-chat] My peer ID:', id);
      if (videoStatus) {
        videoStatus.textContent = 'Video chat ready - share your URL with opponent';
      }
      
      // Update URL with peer ID
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('peer', id);
      window.history.replaceState({}, '', currentUrl);
      
      // Update join URL display
      const joinUrlDiv = document.getElementById('join-url');
      if (joinUrlDiv) {
        joinUrlDiv.textContent = currentUrl.href;
      }
      
      // Show control buttons
      if (startVideoBtn) startVideoBtn.style.display = 'none';
      if (toggleVideoBtn) toggleVideoBtn.style.display = 'inline-block';
      if (toggleAudioBtn) toggleAudioBtn.style.display = 'inline-block';
      if (leaveVideoBtn) leaveVideoBtn.style.display = 'inline-block';
      
      // If remote peer ID in URL, connect to them
      if (remotePeerId && remotePeerId !== id) {
        connectToPeer(remotePeerId);
      }
    });
    
    peer.on('call', (call) => {
      console.log('[video-chat] Incoming call from:', call.peer);
      answerCall(call);
    });
    
    peer.on('error', (err) => {
      console.error('[video-chat] PeerJS error:', err);
      if (videoStatus) {
        videoStatus.textContent = 'Video chat error: ' + err.type;
      }
    });
    
    // Get local media stream
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240 },
      audio: true
    });
    
    if (localVideo) {
      localVideo.srcObject = localStream;
      localVideo.play();
    }
    
    hideLocalPlaceholder();
    showRemotePlaceholder();
    
  } catch (error) {
    console.error('[video-chat] Failed to start video chat:', error);
    if (videoStatus) {
      videoStatus.textContent = 'Failed to start video chat: ' + error.message;
    }
    if (peer) {
      peer.destroy();
      peer = null;
    }
  }
}

// Connect to remote peer
function connectToPeer(peerId) {
  console.log('[video-chat] Connecting to peer:', peerId);
  if (videoStatus) {
    videoStatus.textContent = 'Connecting to opponent...';
  }
  
  const call = peer.call(peerId, localStream);
  
  call.on('stream', (remoteStream) => {
    console.log('[video-chat] Received remote stream');
    if (remoteVideo) {
      remoteVideo.srcObject = remoteStream;
      remoteVideo.play();
    }
    hideRemotePlaceholder();
    if (videoStatus) {
      videoStatus.textContent = 'Video chat connected!';
    }
  });
  
  call.on('close', () => {
    console.log('[video-chat] Call ended');
    if (videoStatus) {
      videoStatus.textContent = 'Opponent disconnected';
    }
    showRemotePlaceholder();
  });
  
  currentCall = call;
}

// Answer incoming call
function answerCall(call) {
  if (videoStatus) {
    videoStatus.textContent = 'Incoming call...';
  }
  
  call.answer(localStream);
  
  call.on('stream', (remoteStream) => {
    console.log('[video-chat] Call answered, received stream');
    if (remoteVideo) {
      remoteVideo.srcObject = remoteStream;
      remoteVideo.play();
    }
    hideRemotePlaceholder();
    if (videoStatus) {
      videoStatus.textContent = 'Video chat connected!';
    }
  });
  
  call.on('close', () => {
    console.log('[video-chat] Call ended');
    if (videoStatus) {
      videoStatus.textContent = 'Opponent disconnected';
    }
    showRemotePlaceholder();
  });
  
  currentCall = call;
}

// Stop video chat
function stopVideoChat() {
  console.log('[video-chat] Stopping video chat');
  
  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }
  
  if (peer) {
    peer.destroy();
    peer = null;
  }
  
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  
  if (localVideo && localVideo.srcObject) {
    localVideo.srcObject = null;
  }
  
  if (remoteVideo && remoteVideo.srcObject) {
    remoteVideo.srcObject = null;
  }
  
  // Update UI
  if (startVideoBtn) startVideoBtn.style.display = 'inline-block';
  if (toggleVideoBtn) toggleVideoBtn.style.display = 'none';
  if (toggleAudioBtn) toggleAudioBtn.style.display = 'none';
  if (leaveVideoBtn) leaveVideoBtn.style.display = 'none';
  if (videoStatus) {
    videoStatus.textContent = 'Click Start to begin video chat';
  }
  
  showLocalPlaceholder();
  showRemotePlaceholder();
}

// Toggle video
function toggleVideo() {
  if (!localStream) return;
  
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    isVideoEnabled = !isVideoEnabled;
    videoTrack.enabled = isVideoEnabled;
    
    if (toggleVideoBtn) {
      toggleVideoBtn.textContent = isVideoEnabled ? '🔴' : '📹';
      toggleVideoBtn.title = isVideoEnabled ? 'Turn off camera' : 'Turn on camera';
    }
    
    if (isVideoEnabled) {
      if (toggleVideoBtn) toggleVideoBtn.classList.remove('muted');
      hideLocalPlaceholder();
    } else {
      if (toggleVideoBtn) toggleVideoBtn.classList.add('muted');
      showLocalPlaceholder();
    }
  }
}

// Toggle audio
function toggleAudio() {
  if (!localStream) return;
  
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    isAudioEnabled = !isAudioEnabled;
    audioTrack.enabled = isAudioEnabled;
    
    if (toggleAudioBtn) {
      toggleAudioBtn.textContent = isAudioEnabled ? '🔊' : '🔇';
      toggleAudioBtn.title = isAudioEnabled ? 'Mute microphone' : 'Unmute microphone';
    }
    
    if (isAudioEnabled) {
      if (toggleAudioBtn) toggleAudioBtn.classList.remove('muted');
    } else {
      if (toggleAudioBtn) toggleAudioBtn.classList.add('muted');
    }
  }
}

// Leave video chat
function leaveVideoChat() {
  stopVideoChat();
}

function showLocalPlaceholder() {
  if (localPlaceholder) localPlaceholder.style.display = 'flex';
  if (localVideo) localVideo.style.display = 'none';
}

function hideLocalPlaceholder() {
  if (localPlaceholder) localPlaceholder.style.display = 'none';
  if (localVideo) localVideo.style.display = 'block';
}

function showRemotePlaceholder() {
  if (remotePlaceholder) remotePlaceholder.style.display = 'flex';
  if (remoteVideo) remoteVideo.style.display = 'none';
}

function hideRemotePlaceholder() {
  if (remotePlaceholder) remotePlaceholder.style.display = 'none';
  if (remoteVideo) remoteVideo.style.display = 'block';
}

// Initialize video chat buttons when page loads
document.addEventListener('DOMContentLoaded', () => {
  initializeVideoChatButtons();
});

// Export functions for external use if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    startVideoChat,
    stopVideoChat,
    toggleVideo,
    toggleAudio,
    initializeVideoChatButtons
  };
}
