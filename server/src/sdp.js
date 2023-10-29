require('dotenv').config()
const { getCodecInfoFromRtpParameters } = require('./utils');
const HLS_SERVER_IP = process.env.EC2_ELASTIC_IP || '127.0.0.1';

// File to create SDP text from mediasoup RTP Parameters
module.exports.createSdpText = (rtpParameters) => {
  const { video, audio } = rtpParameters;
  
  // Video codec info
  const videoCodecInfo = getCodecInfoFromRtpParameters('video', video.rtpParameters);

  // Audio codec info
  const audioCodecInfo = getCodecInfoFromRtpParameters('audio', audio.rtpParameters);

  return `v=0
  o=- 0 0 IN IP4 ${HLS_SERVER_IP}
  s=FFmpeg
  c=IN IP4 ${HLS_SERVER_IP}
  t=0 0
  m=video ${video.remoteRtpPort} RTP/AVP ${videoCodecInfo.payloadType} 
  a=rtpmap:${videoCodecInfo.payloadType} ${videoCodecInfo.codecName}/${videoCodecInfo.clockRate}
  a=sendonly
  m=audio ${audio.remoteRtpPort} RTP/AVP ${audioCodecInfo.payloadType} 
  a=rtpmap:${audioCodecInfo.payloadType} ${audioCodecInfo.codecName}/${audioCodecInfo.clockRate}/${audioCodecInfo.channels}
  a=sendonly
  `;
};
