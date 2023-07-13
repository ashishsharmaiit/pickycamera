const master = {
    kinesisVideoClient: null,
    signalingClients: [],
    storageClient: null,
    streamARNs: [],
    peerConnectionByClientId: {},
    dataChannelByClientId: {},
    localStreams: [],
    remoteStreams: [],
    peerConnectionStatsInterval: null,
};

async function startMaster(localView1, localView2) {
    try {
        master.localViews = [localView1, localView2];

        const channelARN1 = 'arn:aws:kinesisvideo:us-west-2:370359982561:channel/secondary/1687577806894';
        const channelARN2 = 'arn:aws:kinesisvideo:us-west-2:370359982561:channel/webrtc/1686864268470';
        const accessKeyId = 'AKIAVMOZM3HQZ7SWYLMU';
        const secretAccessKey = '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';
        const region = 'us-west-2';

        // Create KVS clients
        const kinesisVideoClient1 = new AWS.KinesisVideo({
            region,
            accessKeyId,
            secretAccessKey,
            correctClockSkew: true,
        });
        master.kinesisVideoClient = kinesisVideoClient1;
        const kinesisVideoClient2 = new AWS.KinesisVideo({
            region,
            accessKeyId,
            secretAccessKey,
            correctClockSkew: true,
        });
        master.kinesisVideoClient = kinesisVideoClient2;

        const protocols = ['WSS', 'HTTPS'];

        // Get signaling channel endpoints
        const getSignalingChannelEndpointResponse1 = await kinesisVideoClient1.getSignalingChannelEndpoint({
            ChannelARN: channelARN1,
            SingleMasterChannelEndpointConfiguration: {
                Protocols: protocols,
                Role: KVSWebRTC.Role.MASTER,
            },
        }).promise();

        const getSignalingChannelEndpointResponse2 = await kinesisVideoClient2.getSignalingChannelEndpoint({
            ChannelARN: channelARN2,
            SingleMasterChannelEndpointConfiguration: {
                Protocols: protocols,
                Role: KVSWebRTC.Role.MASTER,
            },
        }).promise();

        const endpointsByProtocol1 = getSignalingChannelEndpointResponse1.ResourceEndpointList.reduce((endpoints, endpoint) => {
            endpoints[endpoint.Protocol] = endpoint.ResourceEndpoint;
            return endpoints;
        }, {});
        const endpointsByProtocol2 = getSignalingChannelEndpointResponse2.ResourceEndpointList.reduce((endpoints, endpoint) => {
            endpoints[endpoint.Protocol] = endpoint.ResourceEndpoint;
            return endpoints;
        }, {});
        console.log('[MASTER] Endpoints:', endpointsByProtocol1, endpointsByProtocol2);

        // Create Signaling Clients
        const signalingClient1 = new KVSWebRTC.SignalingClient({
            channelARN: channelARN1,
            channelEndpoint: endpointsByProtocol1.WSS,
            role: KVSWebRTC.Role.MASTER,
            region,
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
            systemClockOffset: kinesisVideoClient1.config.systemClockOffset,
        });
        const signalingClient2 = new KVSWebRTC.SignalingClient({
            channelARN: channelARN2,
            channelEndpoint: endpointsByProtocol2.WSS,
            role: KVSWebRTC.Role.MASTER,
            region,
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
            systemClockOffset: kinesisVideoClient2.config.systemClockOffset,
        });

        // Get ICE server configuration
        const kinesisVideoSignalingChannelsClient1 = new AWS.KinesisVideoSignalingChannels({
            region,
            accessKeyId,
            secretAccessKey,
            endpoint: endpointsByProtocol1.HTTPS,
            correctClockSkew: true,
        });
        const kinesisVideoSignalingChannelsClient2 = new AWS.KinesisVideoSignalingChannels({
            region,
            accessKeyId,
            secretAccessKey,
            endpoint: endpointsByProtocol2.HTTPS,
            correctClockSkew: true,
        });
        const getIceServerConfigResponse1 = await kinesisVideoSignalingChannelsClient1.getIceServerConfig({
            ChannelARN: channelARN1,
        }).promise();
        const getIceServerConfigResponse2 = await kinesisVideoSignalingChannelsClient2.getIceServerConfig({
            ChannelARN: channelARN2,
        }).promise();

        const iceServers1 = getIceServerConfigResponse1.IceServerList.map(iceServer => ({
            urls: iceServer.Uris,
            username: iceServer.Username,
            credential: iceServer.Password,
        }));
        const iceServers2 = getIceServerConfigResponse2.IceServerList.map(iceServer => ({
            urls: iceServer.Uris,
            username: iceServer.Username,
            credential: iceServer.Password,
        }));
        console.log('[MASTER] ICE servers:', iceServers1, iceServers2);

        const configuration = {
            iceServers: [],
            iceTransportPolicy: 'all',
        };
        const constraints = {
            video: true,
            audio: false,
        };

        // Get streams from the webcams and display them in the local views.
        try {
            const localStream1 = await navigator.mediaDevices.getUserMedia(constraints);
            localView1.srcObject = localStream1;
            master.localStreams.push(localStream1);

            const localStream2 = await navigator.mediaDevices.getUserMedia(constraints);
            localView2.srcObject = localStream2;
            master.localStreams.push(localStream2);
        } catch (e) {
            console.error('[MASTER] Could not find input device.', e);
            return;
        }

        signalingClient1.on('open', async () => {
            console.log('[MASTER] Connected to signaling service (Channel 1)');
        });

        signalingClient1.on('sdpOffer', async (offer, remoteClientId) => {
            console.log('[MASTER] Received SDP offer from client', remoteClientId, '(Channel 1)');

            // Create a new peer connection using the offer from the given client
            const peerConnection = new RTCPeerConnection(configuration);
            master.peerConnectionByClientId[remoteClientId] = peerConnection;

            // Send any ICE candidates to the other peer
            peerConnection.addEventListener('icecandidate', ({ candidate }) => {
                if (candidate) {
                    console.log('[MASTER] Generated ICE candidate for client', remoteClientId, '(Channel 1)');
                    console.log('[MASTER] Sending ICE candidate to client', remoteClientId, '(Channel 1)');
                    signalingClient1.sendIceCandidate(candidate, remoteClientId);
                } else {
                    console.log('[MASTER] All ICE candidates have been generated for client', remoteClientId, '(Channel 1)');
                }
            });

            // As remote tracks are received, add them to the remote view
            peerConnection.addEventListener('track', event => {
                console.log('[MASTER] Received remote track from client', remoteClientId, '(Channel 1)');
                const remoteView = document.createElement('video');
                remoteView.autoplay = true;
                remoteView.playsinline = true;
                remoteView.controls = true;
                remoteView.muted = true;
                remoteView.srcObject = event.streams[0];
                document.body.appendChild(remoteView);
                master.remoteStreams.push(event.streams[0]);
            });

            master.localStreams.forEach(localStream => {
                localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
            });
            await peerConnection.setRemoteDescription(offer);

            // Create an SDP answer to send back to the client
            console.log('[MASTER] Creating SDP answer for client', remoteClientId, '(Channel 1)');
            await peerConnection.setLocalDescription(await peerConnection.createAnswer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true,
            }));

            console.log('[MASTER] Sending SDP answer to client', remoteClientId, '(Channel 1)');
            signalingClient1.sendSdpAnswer(peerConnection.localDescription, remoteClientId);
            console.log('[MASTER] Generating ICE candidates for client', remoteClientId, '(Channel 1)');
        });

        signalingClient1.on('iceCandidate', async (candidate, remoteClientId) => {
            console.log('[MASTER] Received ICE candidate from client', remoteClientId, '(Channel 1)');

            // Add the ICE candidate received from the client to the peer connection
            const peerConnection = master.peerConnectionByClientId[remoteClientId];
            peerConnection.addIceCandidate(candidate);
        });

        signalingClient1.on('close', () => {
            console.log('[MASTER] Disconnected from signaling channel (Channel 1)');
        });

        signalingClient1.on('error', error => {
            console.error('[MASTER] Signaling client error', error);
        });

        signalingClient2.on('open', async () => {
            console.log('[MASTER] Connected to signaling service (Channel 2)');
        });

        signalingClient2.on('sdpOffer', async (offer, remoteClientId) => {
            console.log('[MASTER] Received SDP offer from client', remoteClientId, '(Channel 2)');

            // Create a new peer connection using the offer from the given client
            const peerConnection = new RTCPeerConnection(configuration);
            master.peerConnectionByClientId[remoteClientId] = peerConnection;

            // Send any ICE candidates to the other peer
            peerConnection.addEventListener('icecandidate', ({ candidate }) => {
                if (candidate) {
                    console.log('[MASTER] Generated ICE candidate for client', remoteClientId, '(Channel 2)');
                    console.log('[MASTER] Sending ICE candidate to client', remoteClientId, '(Channel 2)');
                    signalingClient2.sendIceCandidate(candidate, remoteClientId);
                } else {
                    console.log('[MASTER] All ICE candidates have been generated for client', remoteClientId, '(Channel 2)');
                }
            });

            // As remote tracks are received, add them to the remote view
            peerConnection.addEventListener('track', event => {
                console.log('[MASTER] Received remote track from client', remoteClientId, '(Channel 2)');
                const remoteView = document.createElement('video');
                remoteView.autoplay = true;
                remoteView.playsinline = true;
                remoteView.controls = true;
                remoteView.muted = true;
                remoteView.srcObject = event.streams[0];
                document.body.appendChild(remoteView);
                master.remoteStreams.push(event.streams[0]);
            });

            master.localStreams.forEach(localStream => {
                localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
            });
            await peerConnection.setRemoteDescription(offer);

            // Create an SDP answer to send back to the client
            console.log('[MASTER] Creating SDP answer for client', remoteClientId, '(Channel 2)');
            await peerConnection.setLocalDescription(await peerConnection.createAnswer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true,
            }));

            console.log('[MASTER] Sending SDP answer to client', remoteClientId, '(Channel 2)');
            signalingClient2.sendSdpAnswer(peerConnection.localDescription, remoteClientId);
            console.log('[MASTER] Generating ICE candidates for client', remoteClientId, '(Channel 2)');
        });

        signalingClient2.on('iceCandidate', async (candidate, remoteClientId) => {
            console.log('[MASTER] Received ICE candidate from client', remoteClientId, '(Channel 2)');

            // Add the ICE candidate received from the client to the peer connection
            const peerConnection = master.peerConnectionByClientId[remoteClientId];
            peerConnection.addIceCandidate(candidate);
        });

        signalingClient2.on('close', () => {
            console.log('[MASTER] Disconnected from signaling channel (Channel 2)');
        });

        signalingClient2.on('error', error => {
            console.error('[MASTER] Signaling client error', error);
        });

        console.log('[MASTER] Starting master connection (Channel 1)');
        signalingClient1.open();

        console.log('[MASTER] Starting master connection (Channel 2)');
        signalingClient2.open();
    } catch (e) {
        console.error('[MASTER] Encountered error starting:', e);
    }
}

startMaster(document.getElementById('localView1'), document.getElementById('localView2'));
