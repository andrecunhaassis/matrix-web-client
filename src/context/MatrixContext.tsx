import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import * as sdk from 'matrix-js-sdk';

interface MatrixContextType {
    client: any;
    loading: boolean;
    rooms: any[];
    selectedRoom: any;
    messages: any[];
    newMessage: string;
    setNewMessage: (msg: string) => void;
    handleRoomSelect: (room: any) => void;
    handleSendMessage: (e: React.FormEvent) => void;
    handleLogout: () => void;
    formatTime: (timestamp: number) => string;
    getMxcUrl: (mxcUrl: string) => string;
    getRoomAvatarUrl: (room: any) => string;
    getUserAvatarUrl: (userId: string) => string;
    getLastMessage: (room: any) => string;
    whatsappIdentifier: string;
    userPhoneNumber: string;
    getReactions: (eventId: string) => { [key: string]: string[] };
    isEdited: (eventId: string) => boolean;
    getEditedContent: (eventId: string) => any | null;
    getReplyTo: (eventId: string) => any | null;
    isDeleted: (event: any) => boolean;
}

const MatrixContext = createContext<MatrixContextType>({} as MatrixContextType);

export const useMatrix = () => useContext(MatrixContext);

export const MatrixProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const router = useRouter();
    const [client, setClient] = useState<any>(null);
    const [rooms, setRooms] = useState<any[]>([]);
    const [selectedRoom, setSelectedRoom] = useState<any>(null);
    const selectedRoomRef = useRef<any>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [whatsappIdentifier, setWhatsappIdentifier] = useState<string>('');
    const [userPhoneNumber, setUserPhoneNumber] = useState<string>('');
    const [reactions, setReactions] = useState<{ [eventId: string]: { [key: string]: string[] } }>({});
    const [editedMessages, setEditedMessages] = useState<{ [eventId: string]: any }>({});
    const [replyRelations, setReplyRelations] = useState<{ [eventId: string]: any }>({});

    useEffect(() => {
        selectedRoomRef.current = selectedRoom;
    }, [selectedRoom]);

    const getLastMessageEvent = (room: any) => {
        if (!room || !room.timeline || room.timeline.length === 0) return null;
        for (let i = room.timeline.length - 1; i >= 0; i--) {
            const event = room.timeline[i];
            if (event && event.getType() === 'm.room.message') {
                const content = event.getContent();
                if (content && content.body) return event;
            }
        }
        return null;
    };

    const reorderRooms = (roomList: any[]) => {
        return [...roomList].sort((a, b) => {
            const lastEventA = getLastMessageEvent(a);
            const lastEventB = getLastMessageEvent(b);
            if (!lastEventA && !lastEventB) return 0;
            if (!lastEventA) return 1;
            if (!lastEventB) return -1;
            return lastEventB.getTs() - lastEventA.getTs();
        });
    };

    const getMxcUrl = (mxcUrl: string) => {
        if (!mxcUrl || !mxcUrl.startsWith('mxc://')) {
            console.warn('Invalid MXC URL:', mxcUrl);
            return '';
        }
        try {
            const matches = mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/);
            if (!matches) {
                console.warn('Failed to parse MXC URL:', mxcUrl);
                return '';
            }
            const [_, serverName, mediaId] = matches;
            const homeServer = localStorage.getItem('matrixHomeServer') || 'matrix.assis.cc';
            const accessToken = localStorage.getItem('matrixAccessToken') || '';
            return `https://${homeServer}/_matrix/client/v1/media/download/${serverName}/${mediaId}?allow_redirect=true&access_token=${encodeURIComponent(accessToken)}`;
        } catch (error) {
            console.error('Error converting MXC URL:', error);
            return '';
        }
    };

    const getUserAvatarUrl = (userId: string) => {
        if (!client || !userId) return '';
        try {
            const user = client.getUser(userId);
            if (user && user.avatarUrl) return getMxcUrl(user.avatarUrl);
            return '';
        } catch (error) {
            console.error('Error getting user avatar:', error);
            return '';
        }
    };

    const getRoomAvatarUrl = (room: any) => {
        if (!room) return '';
        if (typeof room === 'string') {
            return getAvatarColor(room);
        }
        try {
            if (!room.currentState) return getAvatarColor(room.name || room.roomId);
            const avatarEvents = room.currentState.getStateEvents('m.room.avatar', '');
            const avatarEvent = Array.isArray(avatarEvents) ? avatarEvents[0] : avatarEvents;
            if (avatarEvent && avatarEvent.getContent() && avatarEvent.getContent().url) {
                return getMxcUrl(avatarEvent.getContent().url);
            }
            if (room.getJoinedMemberCount() === 2) {
                const members = room.getJoinedMembers();
                const otherMember = members.find((m: any) => m.userId !== client?.getUserId());
                if (otherMember) return getUserAvatarUrl(otherMember.userId);
            }
            return '';
        } catch (error) {
            console.error('Error getting room avatar:', error);
            return '';
        }
    };

    const getInitials = (name: string) => {
        if (!name) return '?';
        const parts = name.split(/[ :@_]/);
        return parts.length > 1 ? (parts[0][0] + (parts[1][0] || '')).toUpperCase() : name.substring(0, 2).toUpperCase();
    };

    const getAvatarColor = (str: string) => {
        if (!str) return '#ccc';
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash % 360);
        return `hsl(${hue}, 70%, 80%)`;
    };

    const getSpaceNames = (matrixClient: any): string => {
        if (!matrixClient) return 'Espaço Principal';
        try {
            const allRooms = matrixClient.getRooms();
            const spacesByChildren = allRooms.filter((room: any) => {
                const childEvents = room.currentState.getStateEvents('m.space.child');
                return childEvents && childEvents.length > 0;
            });
            return spacesByChildren.map((room: any) => room.name || room.roomId)[0] || 'Espaço Principal';
        } catch (error) {
            console.error('Error getting space names:', error);
            return 'Espaço Principal';
        }
    };

    const initClient = async () => {
        const accessToken = localStorage.getItem('matrixAccessToken');
        const userId = localStorage.getItem('matrixUserId');
        const homeServer = localStorage.getItem('matrixHomeServer');
        if (!accessToken || !userId || !homeServer) {
            router.replace('/');
            return;
        }
        try {
            const matrixClient = sdk.createClient({
                baseUrl: `https://${homeServer}`,
                accessToken,
                userId,
            });
            setClient(matrixClient);
            await matrixClient.startClient();
            matrixClient.once('sync' as any, (state: string) => {
                if (state === 'PREPARED') {
                    const roomList = matrixClient.getRooms();
                    const sortedRooms = reorderRooms(roomList);
                    setRooms(sortedRooms);
                    setLoading(false);
                    if (sortedRooms.length > 0) {
                        handleRoomSelect(sortedRooms[0]);
                    }
                    const spaceName = getSpaceNames(matrixClient);
                    if (spaceName.includes('WhatsApp')) {
                        const phoneMatch = spaceName.match(/\(\+(\d+)\)/);
                        if (phoneMatch && phoneMatch[1]) {
                            setWhatsappIdentifier(`@whatsapp_${phoneMatch[1]}:${homeServer}`);
                            setUserPhoneNumber(phoneMatch[1]);
                        }
                    }
                }
            });
            matrixClient.on('Room.timeline' as any, (event: any, room: any) => {
                if (selectedRoomRef.current && room.roomId === selectedRoomRef.current.roomId) {
                    loadRoomMessages(room);
                }
                setRooms(prevRooms => reorderRooms(prevRooms));
            });
        } catch (error) {
            console.error('Erro ao inicializar cliente Matrix:', error);
            router.replace('/');
        }
    };

    useEffect(() => {
        initClient();
        return () => {
            if (client) {
                client.removeAllListeners();
                client.stopClient();
            }
        };
    }, [router]);

    const loadRoomMessages = (room: any) => {
        if (!room) return;
        const timelineEvents = [...room.timeline];

        const edits: { [eventId: string]: any } = {};
        const reactionsMap: { [eventId: string]: { [key: string]: string[] } } = {};
        const replies: { [eventId: string]: any } = {};

        const eventsById: { [eventId: string]: any } = {};
        timelineEvents.forEach((event: any) => {
            const eventId = event.getId();
            if (eventId) {
                eventsById[eventId] = event;
            }
        });

        timelineEvents.forEach((event: any) => {
            const type = event.getType();

            if (type === 'm.room.message') {
                const content = event.getContent();

                // Handle edits
                if (content && content['m.relates_to'] &&
                    content['m.relates_to'].rel_type === 'm.replace' &&
                    content['m.new_content']) {
                    const originalEventId = content['m.relates_to'].event_id;
                    edits[originalEventId] = content['m.new_content'];
                }

                // Handle replies - several possible formats
                // 1. Check for standard Matrix reply format
                if (content && content['m.relates_to'] &&
                    content['m.relates_to']['m.in_reply_to'] &&
                    content['m.relates_to']['m.in_reply_to'].event_id) {

                    const referenceEventId = content['m.relates_to']['m.in_reply_to'].event_id;
                    if (eventsById[referenceEventId]) {
                        replies[event.getId()] = eventsById[referenceEventId];
                    }
                }
                // 2. Check for m.reference format (less common)
                else if (content && content['m.relates_to'] &&
                    content['m.relates_to'].rel_type === 'm.reference') {
                    const referenceEventId = content['m.relates_to'].event_id;
                    if (eventsById[referenceEventId]) {
                        replies[event.getId()] = eventsById[referenceEventId];
                    }
                }
            }

            if (type === 'm.reaction') {
                const content = event.getContent();
                if (content && content['m.relates_to'] &&
                    content['m.relates_to'].rel_type === 'm.annotation') {
                    const targetEventId = content['m.relates_to'].event_id;
                    const reaction = content['m.relates_to'].key;
                    const sender = event.getSender();

                    if (!reactionsMap[targetEventId]) {
                        reactionsMap[targetEventId] = {};
                    }

                    if (!reactionsMap[targetEventId][reaction]) {
                        reactionsMap[targetEventId][reaction] = [];
                    }

                    if (!reactionsMap[targetEventId][reaction].includes(sender)) {
                        reactionsMap[targetEventId][reaction].push(sender);
                    }
                }
            }
        });

        setEditedMessages(edits);
        setReactions(reactionsMap);
        setReplyRelations(replies);

        const messageEvents = timelineEvents.filter((event: any) => {
            const type = event.getType();
            const content = event.getContent();

            if (type === 'm.room.message' &&
                content && content['m.relates_to'] &&
                content['m.relates_to'].rel_type === 'm.replace') {
                return false;
            }

            if (type === 'm.reaction') {
                return false;
            }

            return type === 'm.room.message' || type === 'm.sticker' || type === 'm.room.member';
        });

        setMessages(messageEvents);
    };

    const handleRoomSelect = async (room: any) => {
        if (!client || !room) {
            setSelectedRoom(null);
            setMessages([]);
            return;
        }
        setSelectedRoom(room);
        loadRoomMessages(room);
        if (client) {
            try {
                await client.scrollback(room, 200);
                loadRoomMessages(room);
            } catch (error) {
                console.error('Erro ao paginar mensagens:', error);
            }
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!client || !selectedRoom || !newMessage.trim()) return;
        try {
            await client.sendTextMessage(selectedRoom.roomId, newMessage);
            setNewMessage('');
        } catch (error) {
            console.error('Erro ao enviar mensagem:', error);
        }
    };

    const handleLogout = () => {
        if (client) {
            client.stopClient();
        }
        localStorage.removeItem('matrixAccessToken');
        localStorage.removeItem('matrixUserId');
        localStorage.removeItem('matrixHomeServer');
        router.replace('/');
    };

    const formatTime = (timestamp: number) => {
        return new Date(timestamp).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getLastMessage = (room: any) => {
        const lastEvent = getLastMessageEvent(room);
        if (!lastEvent) return '';
        try {
            const content = lastEvent.getContent();
            if (!content) return 'Mensagem vazia';
            const messageType = content.msgtype;
            const body = content.body || '';
            switch (messageType) {
                case 'm.text':
                    return body;
                case 'm.image':
                    return '📷 Imagem';
                case 'm.audio':
                    return '🎵 Áudio';
                case 'm.file':
                    return '📁 Arquivo: ' + body;
                case 'm.video':
                    return '🎬 Vídeo';
                case 'm.sticker':
                    return '🎟️ Sticker';
                default:
                    return body || 'Mensagem';
            }
        } catch (error) {
            console.error('Erro ao processar a última mensagem:', error);
            return 'Erro ao carregar mensagem';
        }
    };

    const getReactions = (eventId: string) => {
        return reactions[eventId] || {};
    };

    const isEdited = (eventId: string) => {
        return !!editedMessages[eventId];
    };

    const getEditedContent = (eventId: string) => {
        return editedMessages[eventId] || null;
    };

    const isDeleted = (event: any) => {
        return event.isRedacted();
    };

    const getReplyTo = (eventId: string) => {
        return replyRelations[eventId] || null;
    };

    return (
        <MatrixContext.Provider
            value={{
                client,
                loading,
                rooms,
                selectedRoom,
                messages,
                newMessage,
                setNewMessage,
                handleRoomSelect,
                handleSendMessage,
                handleLogout,
                formatTime,
                getMxcUrl,
                getRoomAvatarUrl,
                getUserAvatarUrl,
                getLastMessage,
                whatsappIdentifier,
                userPhoneNumber,
                getReactions,
                isEdited,
                getEditedContent,
                getReplyTo,
                isDeleted,
            }}
        >
            {children}
        </MatrixContext.Provider>
    );
};