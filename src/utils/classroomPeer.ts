import type { BoardState, StoneColor, Marker } from '../components/GoBoard';
import Peer, { DataConnection } from 'peerjs';

export type Role = 'TEACHER' | 'STUDENT';

export interface BoardUpdatePayload {
    boardState: BoardState;
    nextColor: StoneColor;
    markers?: Marker[];
}

export interface ClassroomMessage {
    type: 'BOARD_UPDATE' | 'SYNC_REQUEST' | 'CURSOR_MOVE';
    payload: any;
}

export class ClassroomPeer {
    peer: Peer;
    connections: DataConnection[] = [];
    onMessage?: (msg: ClassroomMessage) => void;
    onConnection?: (conn: DataConnection) => void;

    constructor(id?: string) {
        this.peer = id ? new Peer(id) : new Peer();

        this.peer.on('connection', (conn) => {
            this.handleConnection(conn);
        });
    }

    private handleConnection(conn: DataConnection) {
        conn.on('open', () => {
            this.connections.push(conn);
            if (this.onConnection) this.onConnection(conn);
        });

        conn.on('data', (data) => {
            if (this.onMessage) this.onMessage(data as ClassroomMessage);
        });

        conn.on('close', () => {
            this.connections = this.connections.filter(c => c.peer !== conn.peer);
        });
    }

    connect(remoteId: string) {
        const conn = this.peer.connect(remoteId);
        this.handleConnection(conn);
    }

    broadcast(msg: ClassroomMessage) {
        this.connections.forEach(conn => {
            if (conn.open) {
                conn.send(msg);
            }
        });
    }

    destroy() {
        this.peer.destroy();
    }
}
