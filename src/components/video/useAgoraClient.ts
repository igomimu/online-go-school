import { useEffect, useState, useCallback } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import type {
    IAgoraRTCClient,
    IAgoraRTCRemoteUser,
    ICameraVideoTrack,
    IMicrophoneAudioTrack,
} from 'agora-rtc-sdk-ng';

interface UseAgoraClientOptions {
    channelName: string;
    enabled?: boolean;
}

interface AgoraState {
    client: IAgoraRTCClient | null;
    localVideoTrack: ICameraVideoTrack | null;
    localAudioTrack: IMicrophoneAudioTrack | null;
    remoteUsers: IAgoraRTCRemoteUser[];
    isJoined: boolean;
    isLoading: boolean;
    error: string | null;
}

export function useAgoraClient({ channelName, enabled = true }: UseAgoraClientOptions) {
    const [state, setState] = useState<AgoraState>({
        client: null,
        localVideoTrack: null,
        localAudioTrack: null,
        remoteUsers: [],
        isJoined: false,
        isLoading: false,
        error: null,
    });

    const [videoEnabled, setVideoEnabled] = useState(true);
    const [audioEnabled, setAudioEnabled] = useState(true);

    useEffect(() => {
        if (!enabled || !channelName) return;

        let client: IAgoraRTCClient | null = null;
        let localVideoTrack: ICameraVideoTrack | null = null;
        let localAudioTrack: IMicrophoneAudioTrack | null = null;

        const init = async () => {
            setState((prev) => ({ ...prev, isLoading: true, error: null }));

            try {
                const appId = import.meta.env.VITE_AGORA_APP_ID;
                // For development without backend token generation, we can use a temp token or null (if security disabled)
                // CAUTION: Never expose App Certificate in client code
                const token = import.meta.env.VITE_AGORA_TEMP_TOKEN || null;

                if (!appId) {
                    throw new Error('VITE_AGORA_APP_ID not configured');
                }

                client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

                // Handle remote users
                client.on('user-published', async (user, mediaType) => {
                    await client!.subscribe(user, mediaType);
                    if (mediaType === 'video' || mediaType === 'audio') {
                        setState((prev) => ({
                            ...prev,
                            remoteUsers: [...prev.remoteUsers.filter((u) => u.uid !== user.uid), user],
                        }));
                    }
                });

                client.on('user-unpublished', (user, mediaType) => {
                    if (mediaType === 'video') {
                        setState((prev) => ({
                            ...prev,
                            remoteUsers: prev.remoteUsers.map((u) =>
                                u.uid === user.uid ? user : u
                            ),
                        }));
                    }
                });

                client.on('user-left', (user) => {
                    setState((prev) => ({
                        ...prev,
                        remoteUsers: prev.remoteUsers.filter((u) => u.uid !== user.uid),
                    }));
                });

                // Join channel
                // Use a numeric UID if possible, or let Agora assign one (passing null)
                await client.join(appId, channelName, token, null);

                // Create local tracks
                [localAudioTrack, localVideoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();

                // Publish tracks
                await client.publish([localAudioTrack, localVideoTrack]);

                setState({
                    client,
                    localVideoTrack,
                    localAudioTrack,
                    remoteUsers: [],
                    isJoined: true,
                    isLoading: false,
                    error: null,
                });
            } catch (err) {
                console.error('Agora init error:', err);
                setState((prev) => ({
                    ...prev,
                    isLoading: false,
                    error: err instanceof Error ? err.message : 'Failed to initialize video',
                }));
            }
        };

        init();

        return () => {
            localVideoTrack?.close();
            localAudioTrack?.close();
            client?.leave();
        };
    }, [channelName, enabled]);

    const toggleVideo = useCallback(async () => {
        if (state.localVideoTrack) {
            const newState = !videoEnabled;
            await state.localVideoTrack.setEnabled(newState);
            setVideoEnabled(newState);
        }
    }, [state.localVideoTrack, videoEnabled]);

    const toggleAudio = useCallback(async () => {
        if (state.localAudioTrack) {
            const newState = !audioEnabled;
            await state.localAudioTrack.setEnabled(newState);
            setAudioEnabled(newState);
        }
    }, [state.localAudioTrack, audioEnabled]);

    const leave = useCallback(async () => {
        state.localVideoTrack?.close();
        state.localAudioTrack?.close();
        await state.client?.leave();
        setState({
            client: null,
            localVideoTrack: null,
            localAudioTrack: null,
            remoteUsers: [],
            isJoined: false,
            isLoading: false,
            error: null,
        });
    }, [state]);

    return {
        ...state,
        videoEnabled,
        audioEnabled,
        toggleVideo,
        toggleAudio,
        leave,
    };
}
