// Local PeerJS signalling server for the online e2e test (IPv4 only; the container has no IPv6).
import { PeerServer } from 'peer';
PeerServer({ port: 9000, path: '/', host: '127.0.0.1' });
console.log('PeerServer on 127.0.0.1:9000');
