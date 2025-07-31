class VideoChat {
    constructor(socket, roomCode) {
        this.socket = socket;
        this.roomCode = roomCode;
        this.localStream = null;
        this.peerConnections = new Map();
        this.localVideo = null;
        this.remoteVideos = new Map();
        this.isVideoEnabled = true;
        this.isAudioEnabled = true;
        
        this.initialize();
    }

    async initialize() {
        try {
            // Check if getUserMedia is supported
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('getUserMedia is not supported in this browser');
            }

            // Get user media with fallback options
            const constraints = {
                video: {
                    width: { ideal: 640, max: 1280 },
                    height: { ideal: 480, max: 720 },
                    frameRate: { ideal: 30, max: 60 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            };

            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

            // Set up local video
            this.localVideo = document.getElementById('localVideo');
            if (this.localVideo) {
                this.localVideo.srcObject = this.localStream;
                // Ensure video plays
                this.localVideo.play().catch(error => {
                    console.warn('Could not autoplay local video:', error);
                });
            }

            // Join video chat room
            this.socket.emit('joinVideoChat', this.roomCode);

            // Set up event listeners
            this.setupEventListeners();

            console.log('Video chat initialized successfully');
            this.updateStatus('Connected', 'connected');
        } catch (error) {
            console.error('Error initializing video chat:', error);
            let errorMessage = 'Could not access camera/microphone.';
            
            if (error.name === 'NotAllowedError') {
                errorMessage = 'Camera/microphone access denied. Please allow permissions and try again.';
            } else if (error.name === 'NotFoundError') {
                errorMessage = 'No camera or microphone found. Please check your device.';
            } else if (error.name === 'NotSupportedError') {
                errorMessage = 'Video chat is not supported in this browser.';
            }
            
            this.showError(errorMessage);
            this.updateStatus('Error: ' + errorMessage, 'error');
        }
    }

    setupEventListeners() {
        // Socket events for WebRTC signaling
        this.socket.on('videoChatParticipants', (participants) => {
            console.log('Existing participants:', participants);
            if (participants.length > 0) {
                this.updateStatus(`Connecting to ${participants.length} participant(s)...`, 'connecting');
                participants.forEach(participantId => {
                    this.createPeerConnection(participantId);
                });
            } else {
                this.updateStatus('Waiting for other participants...', 'connecting');
            }
        });

        this.socket.on('userJoinedVideoChat', (data) => {
            console.log('New user joined video chat:', data.userId);
            this.updateStatus('New participant joining...', 'connecting');
            this.createPeerConnection(data.userId);
        });

        this.socket.on('userLeftVideoChat', (data) => {
            console.log('User left video chat:', data.userId);
            this.removePeerConnection(data.userId);
            this.updateStatus('Participant left', 'error');
        });

        this.socket.on('videoOffer', (data) => {
            console.log('Received video offer from:', data.from);
            this.handleVideoOffer(data.from, data.offer);
        });

        this.socket.on('videoAnswer', (data) => {
            console.log('Received video answer from:', data.from);
            this.handleVideoAnswer(data.from, data.answer);
        });

        this.socket.on('iceCandidate', (data) => {
            console.log('Received ICE candidate from:', data.from);
            this.handleIceCandidate(data.from, data.candidate);
        });

        // UI event listeners
        const toggleVideoBtn = document.getElementById('toggleVideo');
        const toggleAudioBtn = document.getElementById('toggleAudio');
        const leaveVideoBtn = document.getElementById('leaveVideo');

        if (toggleVideoBtn) {
            toggleVideoBtn.addEventListener('click', () => this.toggleVideo());
        }

        if (toggleAudioBtn) {
            toggleAudioBtn.addEventListener('click', () => this.toggleAudio());
        }

        if (leaveVideoBtn) {
            leaveVideoBtn.addEventListener('click', () => this.leave());
        }
    }

    async createPeerConnection(participantId) {
        try {
            // Check if RTCPeerConnection is supported
            if (!window.RTCPeerConnection) {
                throw new Error('WebRTC is not supported in this browser');
            }

            const peerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' }
                ],
                iceCandidatePoolSize: 10
            });

            // Add local stream tracks
            this.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.localStream);
            });

            // Handle ICE candidates
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.emit('iceCandidate', {
                        to: participantId,
                        candidate: event.candidate,
                        roomCode: this.roomCode
                    });
                }
            };

            // Handle connection state changes
            peerConnection.onconnectionstatechange = () => {
                console.log(`Connection state with ${participantId}:`, peerConnection.connectionState);
                if (peerConnection.connectionState === 'failed') {
                    console.warn(`Connection failed with ${participantId}`);
                    this.removePeerConnection(participantId);
                }
            };

            // Handle ICE connection state changes
            peerConnection.oniceconnectionstatechange = () => {
                console.log(`ICE connection state with ${participantId}:`, peerConnection.iceConnectionState);
            };

            // Handle remote stream
            peerConnection.ontrack = (event) => {
                console.log('Received remote stream from:', participantId);
                this.handleRemoteStream(participantId, event.streams[0]);
                this.updateStatus('Connected', 'connected');
            };

            this.peerConnections.set(participantId, peerConnection);

            // Create and send offer
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            this.socket.emit('videoOffer', {
                to: participantId,
                offer: offer,
                roomCode: this.roomCode
            });

        } catch (error) {
            console.error('Error creating peer connection:', error);
            this.showError('Failed to establish video connection. Please try again.');
        }
    }

    async handleVideoOffer(from, offer) {
        try {
            let peerConnection = this.peerConnections.get(from);
            
            if (!peerConnection) {
                peerConnection = new RTCPeerConnection({
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' }
                    ]
                });

                // Add local stream tracks
                this.localStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, this.localStream);
                });

                // Handle ICE candidates
                peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        this.socket.emit('iceCandidate', {
                            to: from,
                            candidate: event.candidate,
                            roomCode: this.roomCode
                        });
                    }
                };

                // Handle remote stream
                peerConnection.ontrack = (event) => {
                    console.log('Received remote stream from:', from);
                    this.handleRemoteStream(from, event.streams[0]);
                };

                this.peerConnections.set(from, peerConnection);
            }

            await peerConnection.setRemoteDescription(offer);
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            this.socket.emit('videoAnswer', {
                to: from,
                answer: answer,
                roomCode: this.roomCode
            });

        } catch (error) {
            console.error('Error handling video offer:', error);
        }
    }

    async handleVideoAnswer(from, answer) {
        try {
            const peerConnection = this.peerConnections.get(from);
            if (peerConnection) {
                await peerConnection.setRemoteDescription(answer);
            }
        } catch (error) {
            console.error('Error handling video answer:', error);
        }
    }

    async handleIceCandidate(from, candidate) {
        try {
            const peerConnection = this.peerConnections.get(from);
            if (peerConnection) {
                await peerConnection.addIceCandidate(candidate);
            }
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
        }
    }

    handleRemoteStream(participantId, stream) {
        // Create video element for remote stream
        const videoContainer = document.getElementById('remoteVideos');
        if (!videoContainer) return;

        // Remove existing video for this participant if it exists
        const existingVideo = document.getElementById(`remote-${participantId}`);
        if (existingVideo) {
            existingVideo.remove();
        }

        const videoElement = document.createElement('video');
        videoElement.id = `remote-${participantId}`;
        videoElement.className = 'remote-video';
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        videoElement.muted = true; // Prevent echo
        videoElement.srcObject = stream;

        const videoWrapper = document.createElement('div');
        videoWrapper.className = 'video-wrapper';
        videoWrapper.appendChild(videoElement);

        const label = document.createElement('div');
        label.className = 'video-label';
        label.textContent = `Player ${participantId.slice(-4)}`;
        videoWrapper.appendChild(label);

        videoContainer.appendChild(videoWrapper);
        this.remoteVideos.set(participantId, videoElement);

        // Start playing
        videoElement.play().catch(error => {
            console.error('Error playing remote video:', error);
        });
    }

    removePeerConnection(participantId) {
        const peerConnection = this.peerConnections.get(participantId);
        if (peerConnection) {
            peerConnection.close();
            this.peerConnections.delete(participantId);
        }

        // Remove video element
        const videoElement = document.getElementById(`remote-${participantId}`);
        if (videoElement) {
            videoElement.parentElement.remove();
        }
        this.remoteVideos.delete(participantId);
    }

    toggleVideo() {
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            this.isVideoEnabled = videoTrack.enabled;
            
            const toggleVideoBtn = document.getElementById('toggleVideo');
            if (toggleVideoBtn) {
                toggleVideoBtn.textContent = this.isVideoEnabled ? '🔴' : '📹';
                toggleVideoBtn.title = this.isVideoEnabled ? 'Turn off video' : 'Turn on video';
            }
        }
    }

    toggleAudio() {
        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            this.isAudioEnabled = audioTrack.enabled;
            
            const toggleAudioBtn = document.getElementById('toggleAudio');
            if (toggleAudioBtn) {
                toggleAudioBtn.textContent = this.isAudioEnabled ? '🔇' : '🔊';
                toggleAudioBtn.title = this.isAudioEnabled ? 'Mute' : 'Unmute';
            }
        }
    }

    leave() {
        // Close all peer connections
        this.peerConnections.forEach((connection, participantId) => {
            connection.close();
        });
        this.peerConnections.clear();

        // Stop local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }

        // Remove all remote videos
        this.remoteVideos.forEach((video, participantId) => {
            const videoElement = document.getElementById(`remote-${participantId}`);
            if (videoElement) {
                videoElement.parentElement.remove();
            }
        });
        this.remoteVideos.clear();

        // Notify server
        this.socket.emit('leaveVideoChat', this.roomCode);

        // Hide video chat UI
        const videoChatContainer = document.getElementById('videoChatContainer');
        if (videoChatContainer) {
            videoChatContainer.style.display = 'none';
        }

        console.log('Left video chat');
    }

    updateStatus(message, type = '') {
        const statusElement = document.getElementById('videoStatus');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = 'video-status';
            if (type) {
                statusElement.classList.add(type);
            }
        }
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'video-error';
        errorDiv.textContent = message;
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff4444;
            color: white;
            padding: 10px 15px;
            border-radius: 5px;
            z-index: 1000;
            font-size: 14px;
        `;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    }
}

// Export for use in other files
window.VideoChat = VideoChat; 