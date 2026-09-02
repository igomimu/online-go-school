import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: never[]) => void;

const sdk = vi.hoisted(() => ({
  meeting: null as unknown,
  init: vi.fn(),
}));

vi.mock('@cloudflare/realtimekit', () => ({
  default: { init: sdk.init },
}));

import { ClassroomRealtimeKit } from './classroomRealtimeKit';

function createEmitter() {
  const handlers = new Map<string, Handler>();
  return {
    on: vi.fn((event: string, handler: Handler) => { handlers.set(event, handler); }),
    emit(event: string, ...args: never[]) { handlers.get(event)?.(...args); },
  };
}

function createPeer(id: string) {
  return {
    id,
    customParticipantId: 'sid:1001',
    name: '影山 陽翔',
    audioEnabled: false,
    videoEnabled: false,
    audioTrack: undefined,
    videoTrack: undefined,
    on: vi.fn(),
    kick: vi.fn(async () => {}),
  };
}

function createMeeting(peers: ReturnType<typeof createPeer>[]) {
  const participantEvents = createEmitter();
  const joinedEvents = createEmitter();
  const selfEvents = createEmitter();
  const metaEvents = createEmitter();
  const meeting = {
    self: {
      id: 'teacher-peer',
      customParticipantId: 'teacher',
      name: '三村九段',
      audioEnabled: false,
      videoEnabled: false,
      audioTrack: undefined,
      videoTrack: undefined,
      on: selfEvents.on,
    },
    participants: {
      on: participantEvents.on,
      joined: {
        on: joinedEvents.on,
        toArray: () => peers,
      },
      updateRateLimits: vi.fn(),
    },
    meta: { on: metaEvents.on },
    join: vi.fn(async () => {}),
    leave: vi.fn(async () => {}),
  };
  return { meeting, joinedEvents };
}

describe('ClassroomRealtimeKit 同一生徒の二重接続排他', () => {
  beforeEach(() => {
    sdk.init.mockReset();
  });

  it('同じ生徒が後から接続したら、講師が古い接続だけをkickする', async () => {
    const oldPeer = createPeer('peer-old');
    const peers = [oldPeer];
    const { meeting, joinedEvents } = createMeeting(peers);
    sdk.init.mockResolvedValue(meeting);

    const classroom = new ClassroomRealtimeKit();
    await classroom.connect({ token: 'teacher-token' });
    expect(oldPeer.kick).not.toHaveBeenCalled();

    const newPeer = createPeer('peer-new');
    peers.push(newPeer);
    joinedEvents.emit('participantJoined', newPeer as never);

    expect(oldPeer.kick).toHaveBeenCalledTimes(1);
    expect(newPeer.kick).not.toHaveBeenCalled();
  });

  it('古い重複接続だけの退出では、生徒本人の退出通知を出さない', async () => {
    const oldPeer = createPeer('peer-old');
    const newPeer = createPeer('peer-new');
    const peers = [oldPeer, newPeer];
    const { meeting, joinedEvents } = createMeeting(peers);
    sdk.init.mockResolvedValue(meeting);
    const onParticipantLeft = vi.fn();

    const classroom = new ClassroomRealtimeKit();
    classroom.setHandlers({ onParticipantLeft });
    await classroom.connect({ token: 'teacher-token' });

    peers.splice(peers.indexOf(oldPeer), 1);
    joinedEvents.emit('participantLeft', oldPeer as never);
    expect(onParticipantLeft).not.toHaveBeenCalled();

    peers.splice(peers.indexOf(newPeer), 1);
    joinedEvents.emit('participantLeft', newPeer as never);
    expect(onParticipantLeft).toHaveBeenCalledWith('sid:1001', '影山 陽翔');
  });
});
