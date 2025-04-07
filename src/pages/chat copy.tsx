import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import * as sdk from 'matrix-js-sdk';

export default function Chat() {
    const router = useRouter();
    const [client, setClient] = useState<any>(null);
    const [rooms, setRooms] = useState<any[]>([]);
    const [selectedRoom, setSelectedRoom] = useState<any>(null);
    const selectedRoomRef = useRef<any>(null); // New ref for latest selectedRoom
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [whatsappIdentifier, setWhatsappIdentifier] = useState<string>(''); // New state for WhatsApp ID
    const [userPhoneNumber, setUserPhoneNumber] = useState<string>(''); // Extract phone number from WhatsApp identifier for broader matching

    // Update the ref whenever selectedRoom changes
    useEffect(() => {
        selectedRoomRef.current = selectedRoom;
    }, [selectedRoom]);

    // Reimplementação mais robusta da função para obter o último evento de mensagem
    const getLastMessageEvent = (room: any) => {
        if (!room || !room.timeline || room.timeline.length === 0) return null;

        // Encontrar o evento de mensagem mais recente
        for (let i = room.timeline.length - 1; i >= 0; i--) {
            const event = room.timeline[i];
            if (event && event.getType() === 'm.room.message') {
                const content = event.getContent();
                // Verifica se o conteúdo é válido
                if (content && content.body) {
                    return event;
                }
            }
        }
        return null;
    };

    // Adicione uma função para reordenar as salas com base nas mensagens recentes
    const reorderRooms = (roomList: any[]) => {
        return [...roomList].sort((a, b) => {
            const lastEventA = getLastMessageEvent(a);
            const lastEventB = getLastMessageEvent(b);

            // Se não houver eventos, coloca a sala no final
            if (!lastEventA && !lastEventB) return 0;
            if (!lastEventA) return 1;
            if (!lastEventB) return -1;

            return lastEventB.getTs() - lastEventA.getTs();
        });
    };

    // Updated function to convert MXC URLs with authentication
    const getMxcUrl = (mxcUrl: string) => {
        if (!mxcUrl || !mxcUrl.startsWith('mxc://')) {
            console.warn('Invalid MXC URL:', mxcUrl);
            return '';
        }

        try {
            // Extract the server name and media ID from the MXC URL
            const matches = mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/);
            if (!matches) {
                console.warn('Failed to parse MXC URL:', mxcUrl);
                return '';
            }

            const [_, serverName, mediaId] = matches;
            const homeServer = localStorage.getItem('matrixHomeServer') || 'matrix.assis.cc';
            const accessToken = localStorage.getItem('matrixAccessToken') || '';

            // Include the access token in the URL for authentication
            const url = `https://${homeServer}/_matrix/client/v1/media/download/${serverName}/${mediaId}?allow_redirect=true&access_token=${encodeURIComponent(accessToken)}`;
            return url;
        } catch (error) {
            console.error('Error converting MXC URL:', error);
            return '';
        }
    };

    // Get room avatar URL
    const getRoomAvatarUrl = (room: any) => {
        if (!room) return '';

        try {
            // Get avatar from room state
            const avatarEvent = room.currentState.getStateEvents('m.room.avatar', '');
            if (avatarEvent && avatarEvent.getContent() && avatarEvent.getContent().url) {
                return getMxcUrl(avatarEvent.getContent().url);
            }

            // Fallback to member avatar if it's a direct chat (with only 2 members)
            if (room.getJoinedMemberCount() === 2) {
                const members = room.getJoinedMembers();
                const otherMember = members.find((m: any) => m.userId !== client?.getUserId());
                if (otherMember) {
                    return getUserAvatarUrl(otherMember.userId);
                }
            }

            return '';
        } catch (error) {
            console.error('Error getting room avatar:', error);
            return '';
        }
    };

    // Get user avatar URL
    const getUserAvatarUrl = (userId: string) => {
        if (!client || !userId) return '';

        try {
            // Get user from client
            const user = client.getUser(userId);
            if (user && user.avatarUrl) {
                return getMxcUrl(user.avatarUrl);
            }
            return '';
        } catch (error) {
            console.error('Error getting user avatar:', error);
            return '';
        }
    };

    // Generate initials for avatar fallback
    const getInitials = (name: string) => {
        if (!name) return '?';

        // For room names or user IDs
        const parts = name.split(/[ :@_]/);
        if (parts.length > 1) {
            // For names with spaces or Matrix IDs
            return (parts[0][0] + (parts[1][0] || '')).toUpperCase();
        }
        // For single word names
        return name.substring(0, 2).toUpperCase();
    };

    // Generate a consistent color based on string
    const getAvatarColor = (str: string) => {
        if (!str) return '#ccc';

        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }

        const hue = Math.abs(hash % 360);
        return `hsl(${hue}, 70%, 80%)`;
    };

    // Função para obter o nome do espaço principal
    const getSpaceNames = (matrixClient: any): string => {
        if (!matrixClient) return 'Espaço Principal';

        try {
            const rooms = matrixClient.getRooms();

            const spacesByChildren = rooms.filter((room: any) => {
                const childEvents = room.currentState.getStateEvents('m.space.child');
                return childEvents && childEvents.length > 0;
            });

            return spacesByChildren.map((room: any) => room.name || room.roomId)[0] || 'Espaço Principal';
        } catch (error) {
            console.error('Error getting space names:', error);
            return 'Espaço Principal';
        }
    };

    // Inicializar cliente Matrix
    useEffect(() => {
        const initClient = async () => {
            const accessToken = localStorage.getItem('matrixAccessToken');
            const userId = localStorage.getItem('matrixUserId');
            const homeServer = localStorage.getItem('matrixHomeServer');

            if (!accessToken || !userId || !homeServer) {
                router.replace('/');
                return;
            }

            try {
                // Criar cliente Matrix
                const matrixClient = sdk.createClient({
                    baseUrl: `https://${homeServer}`,
                    accessToken,
                    userId,
                });

                setClient(matrixClient);

                // Iniciar cliente
                await matrixClient.startClient();

                // Esperar sincronização
                matrixClient.once('sync' as any, (state: string) => {
                    if (state === 'PREPARED') {
                        const roomList = matrixClient.getRooms();
                        const sortedRooms = reorderRooms(roomList);
                        setRooms(sortedRooms);
                        setLoading(false);

                        // Selecionar a primeira sala se disponível
                        if (sortedRooms.length > 0) {
                            handleRoomSelect(sortedRooms[0]);
                        }

                        // Store WhatsApp identifier from space names
                        const spaceName = getSpaceNames(matrixClient); // Pass matrixClient instead of using client state

                        if (spaceName.includes('WhatsApp')) {
                            // Extract the phone number pattern if it exists
                            const phoneMatch = spaceName.match(/\(\+(\d+)\)/);
                            if (phoneMatch && phoneMatch[1]) {
                                const phoneNumber = phoneMatch[1];
                                setWhatsappIdentifier(`@whatsapp_${phoneNumber}:${homeServer}`);
                                setUserPhoneNumber(phoneNumber);
                            }
                        }
                    }
                });

                // Atualiza a lista de salas quando houver novos eventos
                matrixClient.on('Room.timeline' as any, (event: any, room: any) => {
                    // Atualizar mensagens da sala selecionada
                    if (selectedRoomRef.current && room.roomId === selectedRoomRef.current.roomId) {
                        loadRoomMessages(room);
                    }

                    // Reordenar a lista de salas com base na nova mensagem
                    setRooms(prevRooms => reorderRooms(prevRooms));
                });

            } catch (error) {
                console.error('Erro ao inicializar cliente Matrix:', error);
                router.replace('/');
            }
        };

        initClient();

        // Função de limpeza
        return () => {
            if (client) {
                client.removeAllListeners();
                client.stopClient();
            }
        };
    }, [router]);

    // Efeito para rolar para a última mensagem
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // Carregar mensagens de uma sala
    const loadRoomMessages = (room: any) => {
        if (!room) return;

        // Obter timeline da sala
        const timelineEvents = [...room.timeline];

        // Filtrar apenas mensagens de texto e outros tipos relevantes
        const messageEvents = timelineEvents.filter((event: any) => {
            const type = event.getType();
            return type === 'm.room.message' || type === 'm.room.member';
        });

        setMessages(messageEvents);
    };

    // Selecionar uma sala com paginação
    const handleRoomSelect = async (room: any) => {
        setSelectedRoom(room);
        loadRoomMessages(room);
        // Paginar para buscar mensagens anteriores usando client.scrollback
        if (client) {
            try {
                await client.scrollback(room, 200); // ajusta o número de mensagens conforme necessário
                loadRoomMessages(room);
            } catch (error) {
                console.error('Erro ao paginar mensagens:', error);
            }
        }
    };

    // Enviar mensagem
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

    // Fazer logout
    const handleLogout = () => {
        if (client) {
            client.stopClient();
        }
        localStorage.removeItem('matrixAccessToken');
        localStorage.removeItem('matrixUserId');
        localStorage.removeItem('matrixHomeServer');
        router.replace('/');
    };

    // Formatar data/hora
    const formatTime = (timestamp: number) => {
        return new Date(timestamp).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Melhore a função getLastMessage para garantir que ela lide corretamente com todos os casos
    const getLastMessage = (room: any) => {
        const lastEvent = getLastMessageEvent(room);
        if (!lastEvent) return '';

        try {
            const content = lastEvent.getContent();
            if (!content) return 'Mensagem vazia';

            const messageType = content.msgtype;
            const body = content.body || '';

            // Verifica o tipo de mensagem e retorna um preview adequado
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
                    // Para qualquer outro tipo de mensagem, tenta retornar o texto do corpo
                    return body || 'Mensagem';
            }
        } catch (error) {
            console.error('Erro ao processar a última mensagem:', error);
            return 'Erro ao carregar mensagem';
        }
    };

    // Renderizar mensagem com base no tipo
    const renderMessage = (event: any) => {
        const eventType = event.getType();
        const sender = event.getSender();

        // Check if the message is from the current user or from their WhatsApp
        const isCurrentUser = sender === client?.getUserId();
        const isExactWhatsappMatch = whatsappIdentifier && sender === whatsappIdentifier;

        // Check if sender contains the user's phone number (broader match for WhatsApp messages)
        const isWhatsappWithUserNumber = userPhoneNumber &&
            sender.includes('@whatsapp_') &&
            sender.includes(userPhoneNumber);

        const isUserMessage = isCurrentUser || isExactWhatsappMatch || isWhatsappWithUserNumber;

        // Check if room is a group chat (more than 4 participants)
        const isGroupChat = selectedRoom && selectedRoom.getJoinedMemberCount() > 4;

        if (eventType === 'm.room.message') {
            const content = event.getContent();
            const messageType = content.msgtype;

            // Format the sender display name
            let displayName = sender;
            if (isExactWhatsappMatch || isWhatsappWithUserNumber) {
                displayName = "Você (via WhatsApp)";
            } else if (isCurrentUser) {
                displayName = "Você (via Matrix)";
            } else if (sender.includes('@whatsapp_')) {
                // Format other WhatsApp users' names
                const phoneMatch = sender.match(/@whatsapp_(\d+):/);
                if (phoneMatch && phoneMatch[1]) {
                    displayName = `WhatsApp (+${phoneMatch[1]})`;
                }
            }

            // Get avatar URL for the sender
            const avatarUrl = getUserAvatarUrl(sender);

            // Only show avatar for other users in group chats
            const shouldShowAvatar = !isUserMessage && isGroupChat;

            // Common avatar element for message types
            const avatarElement = shouldShowAvatar ? (
                <div className="flex-shrink-0 mr-2">
                    {avatarUrl ? (
                        <img
                            src={avatarUrl}
                            alt={displayName}
                            className="w-8 h-8 rounded-full"
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                (e.currentTarget.nextSibling as HTMLElement)!.style.display = 'flex';
                            }}
                        />
                    ) : null}
                    <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${avatarUrl ? 'hidden' : 'flex'}`}
                        style={{ backgroundColor: getAvatarColor(sender) }}
                    >
                        {getInitials(displayName)}
                    </div>
                </div>
            ) : null;

            // Only show username for non-user messages in group chats
            const shouldShowUsername = !isUserMessage && isGroupChat;

            if (messageType === 'm.text') {
                return (
                    <div className={`my-2 p-2 rounded-lg max-w-xs md:max-w-md ${isUserMessage ? 'ml-auto bg-blue-100' : 'mr-auto bg-gray-100'} flex ${isUserMessage ? 'flex-row-reverse' : 'flex-row'}`}>
                        {avatarElement}
                        <div>
                            {shouldShowUsername && <p className="text-xs font-bold">{displayName}</p>}
                            <p className="break-words">{content.body}</p>
                            <p className="text-xs text-gray-500 text-right">{formatTime(event.getTs())}</p>
                        </div>
                    </div>
                );
            } else if (messageType === 'm.image') {
                const imageUrl = getMxcUrl(content.url);
                return (
                    <div className={`my-2 p-2 rounded-lg max-w-xs md:max-w-md ${isUserMessage ? 'ml-auto bg-blue-100' : 'mr-auto bg-gray-100'} flex ${isUserMessage ? 'flex-row-reverse' : 'flex-row'}`}>
                        {avatarElement}
                        <div>
                            {shouldShowUsername && <p className="text-xs font-bold">{displayName}</p>}
                            {imageUrl ? (
                                <img
                                    src={imageUrl}
                                    alt={content.body || 'Image'}
                                    className="max-w-full rounded"
                                    onError={(e) => {
                                        console.error('Image failed to load:', imageUrl);
                                        e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23999' d='M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z'/%3E%3C/svg%3E";
                                    }}
                                />
                            ) : (
                                <p className="text-red-500">Não foi possível carregar a imagem</p>
                            )}
                            <p className="text-xs text-gray-500 text-right">{formatTime(event.getTs())}</p>
                        </div>
                    </div>
                );
            }

            // Update for other message types as well
            return (
                <div className={`my-2 p-2 rounded-lg max-w-xs md:max-w-md ${isUserMessage ? 'ml-auto bg-blue-100' : 'mr-auto bg-gray-100'} flex ${isUserMessage ? 'flex-row-reverse' : 'flex-row'}`}>
                    {avatarElement}
                    <div>
                        {shouldShowUsername && <p className="text-xs font-bold">{displayName}</p>}
                        <p className="break-words">Unsupported message type</p>
                        <p className="text-xs text-gray-500 text-right">{formatTime(event.getTs())}</p>
                    </div>
                </div>
            );
        }
        return null;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <p className="text-xl">Carregando...</p>
            </div>
        );
    }

    return (
        <div className="flex h-screen">
            {/* Sidebar com lista de salas */}
            <div className="w-64 bg-gray-100 border-r border-gray-200 flex flex-col">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                    <h2 className="font-bold">Salas</h2>
                    <button
                        onClick={handleLogout}
                        className="text-sm text-red-600"
                    >
                        Sair
                    </button>
                </div>

                <div className="overflow-y-auto flex-grow">
                    {rooms.length === 0 ? (
                        <p className="p-4 text-gray-500">Nenhuma sala disponível</p>
                    ) : (
                        <ul>
                            {rooms.map((room) => {
                                const avatarUrl = getRoomAvatarUrl(room);
                                const roomName = room.name || room.roomId;
                                return (
                                    <li
                                        key={room.roomId}
                                        onClick={() => handleRoomSelect(room)}
                                        className={`p-4 cursor-pointer hover:bg-gray-200 ${selectedRoom?.roomId === room.roomId ? 'bg-gray-200' : ''
                                            } flex items-center`}
                                    >
                                        {/* Room Avatar */}
                                        {avatarUrl ? (
                                            <img
                                                src={avatarUrl}
                                                alt={roomName}
                                                className="w-10 h-10 rounded-full mr-3"
                                                onError={(e) => {
                                                    e.currentTarget.style.display = 'none';
                                                    (e.currentTarget.nextSibling as HTMLElement).style.display = 'flex';
                                                }}
                                            />
                                        ) : null}
                                        <div
                                            className={`w-10 h-10 rounded-full mr-3 flex items-center justify-center text-white ${avatarUrl ? 'hidden' : 'flex'}`}
                                            style={{ backgroundColor: getAvatarColor(roomName) }}
                                        >
                                            {getInitials(roomName)}
                                        </div>
                                        <div className="overflow-hidden">
                                            <div className="font-medium truncate">
                                                {roomName}
                                            </div>
                                            <div className="text-sm text-gray-500 truncate">
                                                {getLastMessage(room)}
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>

            {/* Área principal de chat */}
            <div className="flex-1 flex flex-col">
                {selectedRoom ? (
                    <>
                        {/* Cabeçalho da sala - Fixed to correctly show avatar */}
                        <div className="p-4 border-b border-gray-200 bg-white flex items-center">
                            {/* Room Avatar in header */}
                            {(() => {
                                const avatarUrl = getRoomAvatarUrl(selectedRoom);
                                const roomName = selectedRoom.name || selectedRoom.roomId;
                                return (
                                    <>
                                        {avatarUrl ? (
                                            <img
                                                src={avatarUrl}
                                                alt={roomName}
                                                className="w-10 h-10 rounded-full mr-3"
                                                onError={(e) => {
                                                    e.currentTarget.style.display = 'none';
                                                    (e.currentTarget.nextSibling as HTMLElement)!.style.display = 'flex';
                                                }}
                                            />
                                        ) : (
                                            <div
                                                className="w-10 h-10 rounded-full mr-3 flex items-center justify-center text-white"
                                                style={{ backgroundColor: getAvatarColor(roomName) }}
                                            >
                                                {getInitials(roomName)}
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                            <h3 className="font-bold">
                                {selectedRoom.name || selectedRoom.roomId}
                            </h3>
                        </div>

                        {/* Área de mensagens */}
                        <div className="flex-1 overflow-y-auto p-4 bg-white">
                            {messages.length === 0 ? (
                                <p className="text-center text-gray-500 my-4">Nenhuma mensagem</p>
                            ) : (
                                <div className="space-y-1">
                                    {messages.map((event, index) => (
                                        <div key={event.getId() || index}>
                                            {renderMessage(event)}
                                        </div>
                                    ))}
                                    <div ref={messagesEndRef} />
                                </div>
                            )}
                        </div>

                        {/* Input de mensagem */}
                        <div className="p-4 border-t border-gray-200 bg-white">
                            <form onSubmit={handleSendMessage} className="flex">
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    placeholder="Digite uma mensagem..."
                                    className="flex-1 p-2 border border-gray-300 rounded-l"
                                />
                                <button
                                    type="submit"
                                    className="bg-blue-500 text-white px-4 py-2 rounded-r"
                                >
                                    Enviar
                                </button>
                            </form>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <p className="text-xl text-gray-500">Selecione uma sala para começar a conversar</p>
                    </div>
                )}
            </div>
        </div>
    );
}