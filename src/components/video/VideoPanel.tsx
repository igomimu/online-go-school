import { useEffect, useRef } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff } from 'lucide-react';
import { useAgoraClient } from './useAgoraClient';

interface VideoPanelProps {
    channelName: string;
    enabled?: boolean;
}

export function VideoPanel({ channelName, enabled = true }: VideoPanelProps) {
    const localVideoRef = useRef<HTMLDivElement>(null);
    const remoteVideoRefs = useRef<Map<string | number, HTMLDivElement>>(new Map());

    const {
        localVideoTrack,
        remoteUsers,
        isJoined,
        isLoading,
        error,
        videoEnabled,
        audioEnabled,
        toggleVideo,
        toggleAudio,
        leave,
    } = useAgoraClient({ channelName, enabled });

    // Play local video
    useEffect(() => {
        if (localVideoTrack && localVideoRef.current) {
            localVideoTrack.play(localVideoRef.current);
        }
    }, [localVideoTrack]);

    // Play remote videos
    useEffect(() => {
        remoteUsers.forEach((user) => {
            const container = remoteVideoRefs.current.get(user.uid);
            if (container && user.videoTrack) {
                user.videoTrack.play(container);
            }
            if (user.audioTrack) {
                user.audioTrack.play();
            }
        });
    }, [remoteUsers]);

    if (!enabled) return null;

    if (error) {
        return (
            <div className="bg-red-50 rounded-lg p-4 text-center">
                <p className="text-red-600 text-sm mb-2">{error}</p>
                <p className="text-gray-500 text-xs">
                    カメラ/マイクのアクセス許可、またはApp ID設定を確認してください
                </p>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="glass-panel p-4 flex flex-col items-center justify-center h-32">
                <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mb-2" />
                <p className="text-zinc-500 text-sm">ビデオ接続中...</p>
            </div>
        );
    }

    return (
        <div className="glass-panel overflow-hidden">
            <div className="p-3 border-b border-white/5 flex justify-between items-center bg-white/5">
                <h3 className="font-semibold text-sm">ビデオ通話</h3>
                {isJoined && (
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-xs text-zinc-500">LIVE</span>
                    </div>
                )}
            </div>

            <div className="p-3 space-y-3">
                {/* Remote Users (Teacher or Student) */}
                {remoteUsers.length > 0 ? (
                    remoteUsers.map((user) => (
                        <div
                            key={user.uid}
                            className="relative aspect-video bg-black rounded-lg overflow-hidden border border-white/10"
                        >
                            <div
                                ref={(el) => {
                                    if (el) remoteVideoRefs.current.set(user.uid, el);
                                }}
                                className="w-full h-full"
                            />
                            <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-xs text-white">
                                相手
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="aspect-video bg-zinc-900 rounded-lg flex items-center justify-center border border-white/5">
                        <p className="text-zinc-500 text-sm">相手の参加待ち...</p>
                    </div>
                )}

                {/* Local Video (Self) */}
                <div className="relative aspect-video bg-zinc-900 rounded-lg overflow-hidden border border-white/10">
                    <div ref={localVideoRef} className="w-full h-full" />
                    {!videoEnabled && (
                        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                            <VideoOff className="text-zinc-600" size={32} />
                        </div>
                    )}
                    <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-xs text-white">
                        自分
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="p-3 border-t border-white/5 bg-white/5">
                <div className="flex justify-center gap-3">
                    <button
                        onClick={toggleAudio}
                        className={`p-3 rounded-full transition-all ${audioEnabled
                                ? 'bg-white/10 hover:bg-white/20'
                                : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                            }`}
                    >
                        {audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
                    </button>

                    <button
                        onClick={toggleVideo}
                        className={`p-3 rounded-full transition-all ${videoEnabled
                                ? 'bg-white/10 hover:bg-white/20'
                                : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                            }`}
                    >
                        {videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
                    </button>

                    <button
                        onClick={leave}
                        className="p-3 rounded-full bg-red-500 hover:bg-red-600 text-white transition-all shadow-lg"
                    >
                        <PhoneOff size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
}
