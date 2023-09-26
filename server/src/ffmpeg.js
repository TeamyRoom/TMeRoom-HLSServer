// Class to handle child process used for running FFmpeg

const child_process = require('child_process');
const { EventEmitter } = require('events');

const { createSdpText } = require('./sdp');
const { convertStringToStream } = require('./utils');

const RECORD_FILE_LOCATION_PATH = process.env.RECORD_FILE_LOCATION_PATH || './files';

const fs = require('fs');
const fastify = require('fastify');
const aws = require('aws-sdk')
const { promisify } = require('util');
const { pipeline } = require('stream');
const dotenv = require('dotenv');
const chokidar = require('chokidar');
// read .env file with configuration
dotenv.config();


// create s3 client using your credentials
// TODO : AWS IAM Account AccessKey & SecretKey
const s3 = new aws.S3({
  accessKeyId: "accesskey",
  secretAccessKey: "secretkey"
});






module.exports = class FFmpeg {
  constructor (rtpParameters, roomName) {
    this._rtpParameters = rtpParameters;
    this._process = undefined;
    this._observer = new EventEmitter();
    this._roomName = roomName;
    this._createRoomDirectory();
    this._createProcess();
  }

  _createRoomDirectory() {
    const filePath = RECORD_FILE_LOCATION_PATH;

    if (!fs.existsSync(filePath)) {
      // files 디렉토리가 존재하지 않으면 생성
      fs.mkdirSync(filePath);
    }

    const roomDirectory = `${filePath}/${this._roomName}`;

    if (!fs.existsSync(roomDirectory)) {
      fs.mkdirSync(roomDirectory);
    }
  }


  _createProcess () {
    const sdpString = createSdpText(this._rtpParameters);
    const sdpStream = convertStringToStream(sdpString);
    

    
    console.log('createProcess() [sdpString:%s]', sdpString);

    this._process = child_process.spawn('ffmpeg', this._commandArgs);

    const watcher = chokidar.watch(`${RECORD_FILE_LOCATION_PATH}/${this._roomName}`, {
      ignored: /(^|[/\\])\../, // 숨김 파일 및 폴더 무시
      persistent: true,
    });

    watcher.on('add', (filePath) => {
      // 파일이 추가될 때마다 S3에 업로드
      const fileName = filePath.split('/').pop(); // 파일 이름 추출
      const params = {
        Body: fs.createReadStream(filePath),
        Bucket: "tmeroom-hls-bucket",
        Key: `${this._roomName}/${fileName}`,
      };
    
      s3.upload(params, (err, data) => {
        if (err) {
          console.error('S3 업로드 에러:', err);
        } else {
          console.log('파일 업로드 완료:', fileName);
        }
      });
    });


    watcher.on('change', (filePath) => {
      // 파일이 변경될 때마다 S3에 업로드
      const fileName = filePath.split('/').pop(); // 파일 이름 추출
      const params = {
        Body: fs.createReadStream(filePath),
        Bucket: "tmeroom-hls-bucket",
        Key: `${this._roomName}/${fileName}`,
      };

      s3.upload(params, (err, data) => {
        if (err) {
          console.error('S3 업로드 에러:', err);
        } else {
          console.log('파일 업로드 완료:', fileName);
        }
      });
    });

    if (this._process.stderr) {
      this._process.stderr.setEncoding('utf-8');

      this._process.stderr.on('data', data => 
        console.log('ffmpeg::process::data [data:%o]', data)
      );
    }

    if (this._process.stdout) {
      this._process.stdout.setEncoding('utf-8');

      this._process.stdout.on('data', data => 
        console.log('ffmpeg::process::data [data:%o]', data)
      );

    }

    this._process.on('message', message =>
      console.log('ffmpeg::process::message [message:%o]', message)
    );

    this._process.on('error', error =>
      console.error('ffmpeg::process::error [error:%o]', error)
    );

    this._process.once('close', () => {
      console.log('ffmpeg::process::close');
      this._observer.emit('process-close');
    });

    sdpStream.on('error', error =>
      console.error('sdpStream::error [error:%o]', error)
    );

    // Pipe sdp stream to the ffmpeg process
    sdpStream.resume();
    sdpStream.pipe(this._process.stdin);
  }

  kill () {
    console.log('kill() [pid:%d]', this._process.pid);
    this._process.kill('SIGINT');
  }

  get _commandArgs () {
    let commandArgs = [
      '-loglevel',
      'debug',
      '-protocol_whitelist',
      'pipe,udp,rtp',
      '-fflags',
      '+genpts',
      '-f',
      'sdp',
      '-i',
      'pipe:0',
      '-vsync',
      'vfr',
    ];

    commandArgs = commandArgs.concat(this._videoArgs);
    commandArgs = commandArgs.concat(this._audioArgs);
    commandArgs = commandArgs.concat([
      /*
      '-flags',
      '+global_header',
      */
      `${RECORD_FILE_LOCATION_PATH}/${this._roomName}/${this._rtpParameters.fileName}.m3u8`
    ]);

    console.log('commandArgs:%o', commandArgs);

    return commandArgs;
  }

  get _videoArgs () {
    return [
      '-map',
      '0:v:0',
      '-c:v',
      'h264'
    ];
  }

  get _audioArgs () {
    return [
      '-map',
      '0:a:0',
      '-strict', // libvorbis is experimental
      '-2',
      '-c:a',
      'copy'
    ];
  }

  get _additionalArgs () {
    return [
      '-f', 
      'hls', 
      '-hls_time', 
      '6', 
      '-hls_list_size', 
      '3600'
    ];
  }
}
