define(['/socket.io-client/dist/socket.io.js'], function(io) {

    class voiceClient {
        constructor(s2tCallback, socketAddress = null, mediaStream = null) {
            this.s2tCallback = s2tCallback;
            this.socketAddress = socketAddress
            this.mediaStream = mediaStream;
            this.streamIsExternal = mediaStream ? true : false;


            this.socket = null;
            this.mediaStreamSource = null;
            this.audioContext = null;
            this.processor = null;
            this.state = {
                connected: false,
                recording: false
            }

            this.socketConnect();
        }

        socketConnect() {
            
            if(this.socketAddress) {
                this.socket = io.connect(this.socketAddress, {});
            
                this.socket.on('connect', () => {
                    console.log('socket connected');
                    this.state.connected = true;
                });
                
                this.socket.on('disconnect', () => {
                    console.log('socket disconnected');
                    this.state.connected = false;
                    this.stopRecording();
                });
                
                this.socket.on('recognize', (results) => {
                    this.s2tCallback(results.text);
                });
            }
            else {
                console.log('No socket address!');
            }

        }

        startRecording() {
            if (!this.state.recording) {
                this.state.recording = true;
                this.startMicrophone();
            }
        }
    
        stopRecording() {
            if (this.state.recording) {
                if (this.socket.connected) {
                    this.socket.emit('stream-reset');
                }
                this.state.recording = false;
                this.stopMicrophone();
            }
        }

        startMicrophone() {
            this.audioContext = new AudioContext();
            
            const success = (stream) => {
                console.log('Start recording..')

                this.mediaStream = stream;
                this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream);
    
                this.processor = this.createAudioProcessor(this.audioContext, this.mediaStreamSource);
                this.mediaStreamSource.connect(this.processor);
            };
            
            const fail = (e) => {
                console.error('recording failure', e);
            };
            
            if(this.streamIsExternal) {
                success(this.mediaStream);
            } 
            else if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                navigator.mediaDevices.getUserMedia({
                    video: false,
                    audio: true
                })
                .then(success)
                .catch(fail);
            }
            else {
                navigator.getUserMedia({
                    video: false,
                    audio: true
                }, success, fail);
            }
        }

        stopMicrophone() {
            console.log('Stop recording.')
            if (this.mediaStream && !this.streamIsExternal) {
                this.mediaStream.getTracks()[0].stop();
            }
            if (this.mediaStreamSource) {
                this.mediaStreamSource.disconnect();
            }
            if (this.processor) {
                this.processor.shutdown();
            }
            if (this.audioContext) {
                this.audioContext.close();
            }
        }


        createAudioProcessor(audioContext, audioSource) {
            let processor = audioContext.createScriptProcessor(4096, 1, 1);
            
            const sampleRate = audioSource.context.sampleRate;
                        
            let downsampler = new Worker('/js/downsampling_worker.js');
            downsampler.postMessage({command: "init", inputSampleRate: sampleRate});
            downsampler.onmessage = (e) => {
                if (this.socket.connected) {
                    this.socket.emit('stream-data', e.data.buffer);
                }
            };
            
            processor.onaudioprocess = (event) => {
                var data = event.inputBuffer.getChannelData(0);
                downsampler.postMessage({command: "process", inputFrame: data});
            };
            
            processor.shutdown = () => {
                processor.disconnect();
                this.onaudioprocess = null;
            };
            
            processor.connect(audioContext.destination);
            
            return processor;
        }
    }
    return voiceClient;
});
