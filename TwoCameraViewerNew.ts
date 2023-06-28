/**
 * This file demonstrates the process of starting WebRTC streaming using a KVS Signaling Channel.
 */
const accessKeyId = 'AKIAVMOZM3HQZ7SWYLMU';
const secretAccessKey = '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';
const region = 'us-west-2';
const clientId1 = 'RANDOM_VALUE_1';
const clientId2 = 'RANDOM_VALUE_2';

async function startchassisViewer(chassisCamera) {
  try {
    const viewer = {};

    viewer.chassisCamera = chassisCamera;
    viewer.clientId = clientId1;

    const channelARN = 'arn:aws:kinesisvideo:us-west-2:370359982561:channel/webrtc/1686864268470';

    // Create KVS client
    const kinesisVideoClient = new AWS.KinesisVideo({
      region,
      accessKeyId,
      secretAccessKey,
      correctClockSkew: true,
    });

    // Get signaling channel endpoints
    const getSignalingChannelEndpointResponse = await kinesisVideoClient
      .getSignalingChannelEndpoint({
        ChannelARN: channelARN,
        SingleMasterChannelEndpointConfiguration: {
          Protocols: ['WSS', 'HTTPS'],
          Role: KVSWebRTC.Role.VIEWER,
        },
      })
      .promise();

    const endpointsByProtocol = getSignalingChannelEndpointResponse.ResourceEndpointList.reduce((endpoints, endpoint) => {
      endpoints[endpoint.Protocol] = endpoint.ResourceEndpoint;
      return endpoints;
    }, {});
    console.log('[VIEWER] Endpoints:', endpointsByProtocol);

    const kinesisVideoSignalingChannelsClient = new AWS.KinesisVideoSignalingChannels({
      region,
      accessKeyId,
      secretAccessKey,
      endpoint: endpointsByProtocol.HTTPS,
      correctClockSkew: true,
    });

    // Get ICE server configuration
    const getIceServerConfigResponse = await kinesisVideoSignalingChannelsClient
      .getIceServerConfig({
        ChannelARN: channelARN,
      })
      .promise();

    const iceServers = [];
    iceServers.push({ urls: `stun:stun.kinesisvideo.${region}.amazonaws.com:443` });

    getIceServerConfigResponse.IceServerList.forEach(iceServer => {
      iceServers.push({
        urls: iceServer.Uris,
        username: iceServer.Username,
        credential: iceServer.Password,
      });
    });
    console.log('[VIEWER] ICE servers:', iceServers);

    // Create Signaling Client
    viewer.signalingClient = new KVSWebRTC.SignalingClient({
      channelARN,
      channelEndpoint: endpointsByProtocol.WSS,
      clientId: viewer.clientId,
      role: KVSWebRTC.Role.VIEWER,
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      systemClockOffset: kinesisVideoClient.config.systemClockOffset,
    });

    const resolution = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
    };
    const constraints = {
      video: true,
      audio: false,
    };
    const configuration = {
      iceServers,
      iceTransportPolicy: 'all',
    };
    viewer.peerConnection = new RTCPeerConnection(configuration);

    viewer.signalingClient.on('open', async () => {
      console.log('[VIEWER] Connected to signaling service');

      console.log('[VIEWER] Creating SDP offer');
      await viewer.peerConnection.setLocalDescription(
        await viewer.peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        })
      );

      console.log('[VIEWER] Sending SDP offer');
      viewer.signalingClient.sendSdpOffer(viewer.peerConnection.localDescription);

      console.log('[VIEWER] Generating ICE candidates');
    });

    viewer.signalingClient.on('sdpAnswer', async answer => {
      // Check if the remote description is already set
      if (viewer.peerConnection.remoteDescription) {
        return;
      }

      console.log('[VIEWER] Received SDP answer');
      await viewer.peerConnection.setRemoteDescription(answer);
    });

    viewer.signalingClient.on('iceCandidate', candidate => {
      console.log('[VIEWER] Received ICE candidate');
      viewer.peerConnection.addIceCandidate(candidate);
    });

    viewer.signalingClient.on('close', () => {
      console.log('[VIEWER] Disconnected from signaling channel');
    });

    viewer.signalingClient.on('error', error => {
      console.error('[VIEWER] Signaling client error:', error);
    });

    viewer.peerConnection.addEventListener('icecandidate', ({ candidate }) => {
      if (candidate) {
        console.log('[VIEWER] Generated ICE candidate');
        viewer.signalingClient.sendIceCandidate(candidate);
      }
    });

    viewer.peerConnection.addEventListener('track', event => {
      console.log('[VIEWER] Received remote track');
      if (chassisCamera.srcObject) {
        return;
      }
      viewer.remoteStream = event.streams[0];
      chassisCamera.srcObject = viewer.remoteStream;
    });

    console.log('[VIEWER] Starting viewer connection');
    viewer.signalingClient.open();
  } catch (e) {
    console.error('[VIEWER] Encountered error starting:', e);
  }
}

async function startArmViewer(armCamera) {
  try {
    const viewer = {};

    viewer.armCamera = armCamera;
    viewer.clientId = clientId2;

    const channelARN = 'arn:aws:kinesisvideo:us-west-2:370359982561:channel/secondary/1687577806894';

    // Create KVS client
    const kinesisVideoClient = new AWS.KinesisVideo({
      region,
      accessKeyId,
      secretAccessKey,
      correctClockSkew: true,
    });

    // Get signaling channel endpoints
    const getSignalingChannelEndpointResponse = await kinesisVideoClient
      .getSignalingChannelEndpoint({
        ChannelARN: channelARN,
        SingleMasterChannelEndpointConfiguration: {
          Protocols: ['WSS', 'HTTPS'],
          Role: KVSWebRTC.Role.VIEWER,
        },
      })
      .promise();

    const endpointsByProtocol = getSignalingChannelEndpointResponse.ResourceEndpointList.reduce((endpoints, endpoint) => {
      endpoints[endpoint.Protocol] = endpoint.ResourceEndpoint;
      return endpoints;
    }, {});
    console.log('[VIEWER] Endpoints:', endpointsByProtocol);

    const kinesisVideoSignalingChannelsClient = new AWS.KinesisVideoSignalingChannels({
      region,
      accessKeyId,
      secretAccessKey,
      endpoint: endpointsByProtocol.HTTPS,
      correctClockSkew: true,
    });

    // Get ICE server configuration
    const getIceServerConfigResponse = await kinesisVideoSignalingChannelsClient
      .getIceServerConfig({
        ChannelARN: channelARN,
      })
      .promise();

    const iceServers = [];
    iceServers.push({ urls: `stun:stun.kinesisvideo.${region}.amazonaws.com:443` });

    getIceServerConfigResponse.IceServerList.forEach(iceServer => {
      iceServers.push({
        urls: iceServer.Uris,
        username: iceServer.Username,
        credential: iceServer.Password,
      });
    });
    console.log('[VIEWER] ICE servers:', iceServers);

    // Create Signaling Client
    viewer.signalingClient = new KVSWebRTC.SignalingClient({
      channelARN,
      channelEndpoint: endpointsByProtocol.WSS,
      clientId: viewer.clientId,
      role: KVSWebRTC.Role.VIEWER,
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      systemClockOffset: kinesisVideoClient.config.systemClockOffset,
    });

    const resolution = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
    };
    const constraints = {
      video: true,
      audio: false,
    };
    const configuration = {
      iceServers,
      iceTransportPolicy: 'all',
    };
    viewer.peerConnection = new RTCPeerConnection(configuration);

    viewer.signalingClient.on('open', async () => {
      console.log('[VIEWER] Connected to signaling service');

      console.log('[VIEWER] Creating SDP offer');
      await viewer.peerConnection.setLocalDescription(
        await viewer.peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        })
      );

      console.log('[VIEWER] Sending SDP offer');
      viewer.signalingClient.sendSdpOffer(viewer.peerConnection.localDescription);

      console.log('[VIEWER] Generating ICE candidates');
    });

    viewer.signalingClient.on('sdpAnswer', async answer => {
      // Check if the remote description is already set
      if (viewer.peerConnection.remoteDescription) {
        return;
      }

      console.log('[VIEWER] Received SDP answer');
      await viewer.peerConnection.setRemoteDescription(answer);
    });

    viewer.signalingClient.on('iceCandidate', candidate => {
      console.log('[VIEWER] Received ICE candidate');
      viewer.peerConnection.addIceCandidate(candidate);
    });

    viewer.signalingClient.on('close', () => {
      console.log('[VIEWER] Disconnected from signaling channel');
    });

    viewer.signalingClient.on('error', error => {
      console.error('[VIEWER] Signaling client error:', error);
    });

    viewer.peerConnection.addEventListener('icecandidate', ({ candidate }) => {
      if (candidate) {
        console.log('[VIEWER] Generated ICE candidate');
        viewer.signalingClient.sendIceCandidate(candidate);
      }
    });

    viewer.peerConnection.addEventListener('track', event => {
      console.log('[VIEWER] Received remote track');
      if (armCamera.srcObject) {
        return;
      }
      viewer.remoteStream = event.streams[0];
      armCamera.srcObject = viewer.remoteStream;
    });

    console.log('[VIEWER] Starting viewer connection');
    viewer.signalingClient.open();
  } catch (e) {
    console.error('[VIEWER] Encountered error starting:', e);
  }
}

async function startViewers() {
  const armCamera = document.getElementById('armCamera');
  const chassisCamera = document.getElementById('chassisCamera');

  await Promise.all([
    startchassisViewer(chassisCamera),
    startArmViewer(armCamera),
  ]);
}

startViewers();
