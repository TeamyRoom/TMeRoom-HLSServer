FROM node:18
USER root
RUN echo "deb http://archive.debian.org/debian stretch main" > /etc/apt/sources.list
RUN \
	set -x \
    && apt-get -y update \
    && apt-get install aptitude -y \
    && aptitude install -y net-tools build-essential make python3 python3-pip valgrind ffmpeg

WORKDIR /mediasoup
COPY . /mediasoup

RUN  chmod 777 -R /mediasoup
COPY /server/package.json ./server
COPY /server/package-lock.json ./server

RUN cd server && npm update && npm install
COPY . .
RUN cd server/node_modules/mediasoup/worker && make

RUN chmod +x start.sh
CMD ["./start.sh"]
EXPOSE 443 8080 80 3000 20000-20100 30000-30100 
