/**
 * This file demonstrates the process of starting WebRTC streaming using a KVS Signaling Channel.
 */
const master = {
    kinesisVideoClient: null,
    signalingClient: null,
    storageClient: null,
    streamARN: null,
    peerConnectionByClientId: {},
    dataChannelByClientId: {},
    localStream: null,
    remoteStreams: [],
    peerConnectionStatsInterval: null,
};

async function startMaster(localView, remoteView) {
    try {
        master.localView = localView;
        master.remoteView = remoteView;

        const channelARN = 'arn:aws:kinesisvideo:us-west-2:370359982561:channel/webrtc/1686864268470';
        const accessKeyId = 'AKIAVMOZM3HQZ7SWYLMU';
        const secretAccessKey = '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';
        const region = 'us-west-2';

        // Create KVS client
        const kinesisVideoClient = new AWS.KinesisVideo({
            region,
            accessKeyId,
            secretAccessKey,
            correctClockSkew: true,
        });
        master.kinesisVideoClient = kinesisVideoClient;


        const protocols = ['WSS', 'HTTPS'];


        // Get signaling channel endpoints
        const getSignalingChannelEndpointResponse = await kinesisVideoClient
            .getSignalingChannelEndpoint({
                ChannelARN: channelARN,
                SingleMasterChannelEndpointConfiguration: {
                    Protocols: protocols,
                    Role: KVSWebRTC.Role.MASTER,
                },
            })
            .promise();
        const endpointsByProtocol = getSignalingChannelEndpointResponse.ResourceEndpointList.reduce((endpoints, endpoint) => {
            endpoints[endpoint.Protocol] = endpoint.ResourceEndpoint;
            return endpoints;
        }, {});
        console.log('[MASTER] Endpoints:', endpointsByProtocol);

        // Create Signaling Client
        master.signalingClient = new KVSWebRTC.SignalingClient({
            channelARN,
            channelEndpoint: endpointsByProtocol.WSS,
            role: KVSWebRTC.Role.MASTER,
            region,
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
            systemClockOffset: kinesisVideoClient.config.systemClockOffset,
        });


        // Get ICE server configuration
        const kinesisVideoSignalingChannelsClient = new AWS.KinesisVideoSignalingChannels({
            region,
            accessKeyId,
            secretAccessKey,
            endpoint: endpointsByProtocol.HTTPS,
            correctClockSkew: true,
        });
        const getIceServerConfigResponse = await kinesisVideoSignalingChannelsClient
            .getIceServerConfig({
                ChannelARN: channelARN,
            })
            .promise();
        const iceServers = [];
            iceServers.push({ urls: `stun:stun.kinesisvideo.${region}.amazonaws.com:443` });
        
            getIceServerConfigResponse.IceServerList.forEach(iceServer =>
                iceServers.push({
                    urls: iceServer.Uris,
                    username: iceServer.Username,
                    credential: iceServer.Password,
                }),
            );
        
        console.log('[MASTER] ICE servers:', iceServers);

        const configuration = {
            iceServers,
            iceTransportPolicy: 'all',
        };
        const constraints = {
            video: true,
            audio: false,
        };

        const resolution =  {
            width: { ideal: 1280 },
            height: { ideal: 720 },
        };

        // Get a stream from the webcam and display it in the local view.
        // If no video/audio needed, no need to request for the sources.
        // Otherwise, the browser will throw an error saying that either video or audio has to be enabled.
        
            try {
                master.localStream = await navigator.mediaDevices.getUserMedia(constraints);
                localView.srcObject = master.localStream;
            } catch (e) {
                console.error(`[MASTER] Could not find input device.`, e);
                return;
            }
        

        master.signalingClient.on('open', async () => {
            console.log('[MASTER] Connected to signaling service');
            
        });

        master.signalingClient.on('sdpOffer', async (offer, remoteClientId) => {
            console.log('[MASTER] Received SDP offer from client', remoteClientId);

            // Create a new peer connection using the offer from the given client
            const peerConnection = new RTCPeerConnection(configuration);
            master.peerConnectionByClientId[remoteClientId] = peerConnection;

           

            // Send any ICE candidates to the other peer
            peerConnection.addEventListener('icecandidate', ({ candidate }) => {
                if (candidate) {
                    console.log('[MASTER] Generated ICE candidate for client', remoteClientId);

                    // When trickle ICE is enabled, send the ICE candidates as they are generated.
                        console.log('[MASTER] Sending ICE candidate to client', remoteClientId);
                        master.signalingClient.sendIceCandidate(candidate, remoteClientId);
                    
                } else {
                    console.log('[MASTER] All ICE candidates have been generated for client', remoteClientId);

                }
            });

            // As remote tracks are received, add them to the remote view
            peerConnection.addEventListener('track', event => {
                console.log('[MASTER] Received remote track from client', remoteClientId);
                if (remoteView.srcObject) {
                    return;
                }
                remoteView.srcObject = event.streams[0];
            });

            // If there's no video/audio, master.localStream will be null. So, we should skip adding the tracks from it.
            if (master.localStream) {
                master.localStream.getTracks().forEach(track => peerConnection.addTrack(track, master.localStream));
            }
            await peerConnection.setRemoteDescription(offer);

            // Create an SDP answer to send back to the client
            console.log('[MASTER] Creating SDP answer for client', remoteClientId);
            await peerConnection.setLocalDescription(
                await peerConnection.createAnswer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true,
                }),
            );

            console.log('[MASTER] Sending SDP answer to client', remoteClientId);
                master.signalingClient.sendSdpAnswer(peerConnection.localDescription, remoteClientId);
            
                console.log('[MASTER] Generating ICE candidates for client', remoteClientId);
        });

        master.signalingClient.on('iceCandidate', async (candidate, remoteClientId) => {
            console.log('[MASTER] Received ICE candidate from client', remoteClientId);

            // Add the ICE candidate received from the client to the peer connection
            const peerConnection = master.peerConnectionByClientId[remoteClientId];
            peerConnection.addIceCandidate(candidate);
        });

        master.signalingClient.on('close', () => {
            console.log('[MASTER] Disconnected from signaling channel');
        });

        master.signalingClient.on('error', error => {
            console.error('[MASTER] Signaling client error', error);
        });

        console.log('[MASTER] Starting master connection');
        master.signalingClient.open();
    } catch (e) {
        console.error('[MASTER] Encountered error starting:', e);
    }
}

startMaster(document.getElementById('localView'), document.getElementById('remoteView'));
