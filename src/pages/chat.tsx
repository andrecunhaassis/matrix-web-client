import React, { useRef, useEffect, useState } from 'react';
import { MatrixProvider, useMatrix } from '../context/MatrixContext';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import { Search, Smile, Mic, SendHorizonal, X, Pin } from 'lucide-react';

const ChatUI: React.FC = () => {
    const {
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
    } = useMatrix();

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messageRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
    const [searchTerm, setSearchTerm] = useState('');
    const [showEmojiButton, setShowEmojiButton] = useState(false);
    const [expandedImage, setExpandedImage] = useState<string | null>(null);
    const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

    // Function to check if a room contains priority senders
    const isPriorityRoom = (room: any) => {
        const priorityNumbers = ['5511935019634', '5511935026853'];
        const members = room.getJoinedMembers();
        return members.some((member: any) => {
            const userId = member.userId || '';
            return priorityNumbers.some(number => userId.includes(number));
        });
    };

    // Filter and sort rooms based on search term and priority
    const filteredRooms = rooms
        .filter(room => {
            const roomName = room.name || room.roomId;
            const lastMsg = getLastMessage(room) || '';
            return roomName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                lastMsg.toLowerCase().includes(searchTerm.toLowerCase());
        })
        .sort((a, b) => {
            const aIsPriority = isPriorityRoom(a);
            const bIsPriority = isPriorityRoom(b);
            if (aIsPriority && !bIsPriority) return -1;
            if (!aIsPriority && bIsPriority) return 1;
            return 0;
        });

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleTemplateClick = async (templateText: string) => {
        if (client && selectedRoom) {
            try {
                await client.sendTextMessage(selectedRoom.roomId, templateText);
            } catch (error) {
                console.error('Error sending template message:', error);
            }
        }
    };

    const renderMessageContent = (messageText: string) => {
        if (!messageText) return null;

        const templateMatch = messageText.match(/<([^>]+)>\s*(?:Use the WhatsApp app to click buttons)?$/);

        if (templateMatch) {
            const templateText = templateMatch[1].trim();
            const cleanedText = messageText.replace(/<([^>]+)>\s*(?:Use the WhatsApp app to click buttons)?$/, '').trim();

            return (
                <div>
                    {cleanedText && <MarkdownMessage content={cleanedText.replace(/\n/g, "  \n")} />}
                    <button
                        onClick={() => handleTemplateClick(templateText)}
                        className="mt-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 px-3 py-1.5 rounded-md text-sm border border-gray-300 dark:border-gray-600 w-auto inline-block cursor-pointer transition-colors"
                    >
                        {templateText}
                    </button>
                </div>
            );
        }

        return <MarkdownMessage content={messageText.replace(/\n/g, "  \n")} />;
    };

    const handleImageClick = (imageUrl: string) => {
        setExpandedImage(imageUrl);
    };

    const closeExpandedImage = () => {
        setExpandedImage(null);
    };

    const renderReactions = (eventId: string) => {
        const reactions = getReactions(eventId);
        if (!reactions || Object.keys(reactions).length === 0) return null;

        return (
            <div className="flex flex-wrap gap-2 mt-1">
                {Object.entries(reactions).map(([emoji, users]) => (
                    <div
                        key={`${eventId}-${emoji}`}
                        className="bg-gray-200 dark:bg-gray-700 rounded-full px-2 py-0.5 text-xs flex items-center"
                        title={users.join(', ')}
                    >
                        <span className="mr-1">{emoji}</span>
                        <span>{users.length}</span>
                    </div>
                ))}
            </div>
        );
    };

    const scrollToMessage = (eventId: string) => {
        if (messageRefs.current[eventId]) {
            messageRefs.current[eventId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedMessageId(eventId);
            setTimeout(() => {
                setHighlightedMessageId(null);
            }, 2000);
        }
    };

    const renderReplyPreview = (originalEvent: any) => {
        if (!originalEvent) return null;

        const sender = originalEvent.getSender();
        let displayName = sender;

        if (sender === client?.getUserId()) {
            displayName = "Você";
        } else if (sender === whatsappIdentifier || (userPhoneNumber && sender.includes('@whatsapp_') && sender.includes(userPhoneNumber))) {
            displayName = "Você";
        } else if (sender.includes('@whatsapp_')) {
            displayName = selectedRoom?.name || "Contato";
        }

        const content = originalEvent.getContent();
        let previewText = '';

        if (isDeleted(originalEvent)) {
            previewText = "Mensagem excluída";
        } else if (content) {
            if (originalEvent.getType() === 'm.sticker') {
                previewText = '🎟️ Sticker';
            } else {
                const messageType = content.msgtype;

                if (messageType === 'm.text') {
                    previewText = content.body?.substring(0, 100) + (content.body?.length > 100 ? '...' : '');
                } else if (messageType === 'm.image') {
                    previewText = '📷 Imagem';
                } else if (messageType === 'm.audio') {
                    previewText = '🎵 Áudio';
                } else if (messageType === 'm.file') {
                    previewText = '📁 Arquivo';
                } else if (messageType === 'm.video') {
                    previewText = '🎬 Vídeo';
                } else {
                    previewText = content.body || 'Mensagem';
                }
            }
        }

        const originalEventId = originalEvent.getId();

        return (
            <div
                className="border-l-4 border-gray-300 dark:border-gray-600 pl-2 py-1 mb-2 text-sm bg-gray-50 dark:bg-gray-800 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={(e) => {
                    e.stopPropagation();
                    scrollToMessage(originalEventId);
                }}
            >
                <div className="font-medium text-gray-700 dark:text-gray-300">{displayName}</div>
                <div className="text-gray-600 dark:text-gray-400 break-words">{previewText}</div>
            </div>
        );
    };

    const renderMessage = (event: any) => {
        const eventType = event.getType();
        const sender = event.getSender();
        const eventId = event.getId();

        const isCurrentUser = sender === client?.getUserId();
        const isExactWhatsappMatch = whatsappIdentifier && sender === whatsappIdentifier;
        const isWhatsappWithUserNumber =
            userPhoneNumber &&
            sender.includes('@whatsapp_') &&
            sender.includes(userPhoneNumber);
        const isUserMessage = isCurrentUser || isExactWhatsappMatch || isWhatsappWithUserNumber;
        const isGroupChat = selectedRoom && selectedRoom.getJoinedMemberCount() > 4;

        if (eventType === 'm.room.message' || eventType === 'm.sticker') {
            if (isDeleted(event)) {
                return (
                    <div className={`w-fit min-w-14 max-w-lg mx-2 my-1 px-3 pt-2 pb-1 rounded-lg border border-gray-200 dark:border-gray-700 
                        ${isUserMessage ? 'ml-auto bg-green-100 dark:bg-green-900' : 'mr-auto bg-white dark:bg-gray-800'}`}>
                        <p className="text-gray-500 dark:text-gray-400 italic text-sm">Mensagem excluída</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 text-right">{formatTime(event.getTs())}</p>
                    </div>
                );
            }

            const content = event.getContent();
            let messageType = content.msgtype;

            if (eventType === 'm.sticker') {
                messageType = 'm.sticker';
            }

            let displayName = sender;
            if (isExactWhatsappMatch || isWhatsappWithUserNumber) {
                // via WhatsApp
                displayName = "Você";
            } else if (isCurrentUser) {
                // via Matrix
                displayName = "Você";
            } else if (sender.includes('@whatsapp_')) {
                const phoneMatch = sender.match(/@whatsapp_(\d+):/);
                if (phoneMatch && phoneMatch[1]) {
                    displayName = `WhatsApp (+${phoneMatch[1]})`;
                }
            }

            const avatarUrl = getUserAvatarUrl(sender);
            const shouldShowAvatar = !isUserMessage && isGroupChat;
            const avatarElement = shouldShowAvatar ? (
                <div className="flex-shrink-0 mr-2">
                    {avatarUrl ? (
                        <img
                            src={avatarUrl || '/default-avatar.png'}
                            alt={displayName}
                            className="w-8 h-8 rounded-full"
                            onError={(e) => {
                                e.currentTarget.onerror = null;
                                e.currentTarget.src = '/default-avatar.png';
                            }}
                        />
                    ) : (
                        <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white"
                            style={{ backgroundColor: getRoomAvatarUrl(displayName) }}
                        >
                            {displayName.substring(0, 2)}
                        </div>
                    )}
                </div>
            ) : null;

            const shouldShowUsername = !isUserMessage && isGroupChat;

            let messageContent = content;
            let editedMark = null;

            if (isEdited(eventId)) {
                messageContent = getEditedContent(eventId);
                editedMark = <span className="text-xs text-gray-500 dark:text-gray-400 italic ml-1">(editado)</span>;
            }

            const replyToEvent = getReplyTo(eventId);
            const replyPreview = replyToEvent ? renderReplyPreview(replyToEvent) : null;

            if (messageType === 'm.text') {
                return (
                    <div
                        ref={(el) => { messageRefs.current[eventId] = el; }}
                        className={`flex ${isUserMessage ? 'justify-end' : 'justify-start'} my-1 ${highlightedMessageId === eventId ? 'animate-pulse bg-yellow-100 dark:bg-yellow-900 rounded-xl' : ''}`}
                    >
                        {avatarElement}
                        <div className={`w-fit min-w-14 max-w-lg px-3 pt-2 pb-1 rounded-lg border border-gray-200 dark:border-gray-700 
                            ${isUserMessage ? 'bg-green-100 dark:bg-green-900 text-gray-900 dark:text-gray-100' : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'}`}>
                            {shouldShowUsername && <p className="text-xs font-bold">{displayName}</p>}
                            {replyPreview}
                            <div className="flex items-center">
                                <div className="text-[14.2px]">
                                    {renderMessageContent(messageContent.body)}
                                </div>
                                {editedMark}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 text-right">{formatTime(event.getTs())}</p>
                            {renderReactions(eventId)}
                        </div>
                    </div>
                );
            } else if (messageType === 'm.image') {
                const imageUrl = getMxcUrl(content.url);
                return (
                    <div
                        ref={(el) => { messageRefs.current[eventId] = el; }}
                        className={`flex ${isUserMessage ? 'justify-end' : 'justify-start'} my-1 ${highlightedMessageId === eventId ? 'animate-pulse bg-yellow-100 dark:bg-yellow-900 rounded-xl' : ''}`}
                    >
                        {avatarElement}
                        <div className={`w-fit min-w-14 max-w-lg px-3 pt-2 pb-1 rounded-lg border border-gray-200 dark:border-gray-700 
                            ${isUserMessage ? 'bg-green-100 dark:bg-green-900 text-gray-900 dark:text-gray-100' : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'}`}>
                            {shouldShowUsername && <p className="text-xs font-bold">{displayName}</p>}
                            {replyPreview}
                            {imageUrl ? (
                                <>
                                    <div className="cursor-pointer" onClick={() => handleImageClick(imageUrl)}>
                                        <img
                                            src={imageUrl || '/default-image.jpg'}
                                            alt={content.body || 'Image'}
                                            className="max-w-[400px] max-h-[400px] object-contain rounded mb-2"
                                            onError={(e) => {
                                                e.currentTarget.onerror = null;
                                                e.currentTarget.src = '/default-image.jpg';
                                            }}
                                        />
                                    </div>
                                    {content.body && renderMessageContent(content.body)}
                                </>
                            ) : (
                                <p className="text-red-500">Não foi possível carregar a imagem</p>
                            )}
                            <p className="text-xs text-gray-500 dark:text-gray-400 text-right">{formatTime(event.getTs())}</p>
                            {renderReactions(eventId)}
                        </div>
                    </div>
                );
            } else if (messageType === 'm.sticker') {
                const stickerUrl = getMxcUrl(content.url);
                return (
                    <div
                        ref={(el) => { messageRefs.current[eventId] = el; }}
                        className={`flex ${isUserMessage ? 'justify-end' : 'justify-start'} my-1 ${highlightedMessageId === eventId ? 'animate-pulse bg-yellow-100 dark:bg-yellow-900 rounded-xl' : ''}`}
                    >
                        {avatarElement}
                        <div className={`w-fit min-w-14 max-w-lg px-3 pt-2 pb-1 rounded-lg border border-gray-200 dark:border-gray-700 
                            ${isUserMessage ? 'bg-green-100 dark:bg-green-900 text-gray-900 dark:text-gray-100' : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'}`}>
                            {shouldShowUsername && <p className="text-xs font-bold">{displayName}</p>}
                            {replyPreview}
                            {stickerUrl ? (
                                <div className="sticker-container cursor-pointer" onClick={() => handleImageClick(stickerUrl)}>
                                    <img
                                        src={stickerUrl || '/default-image.jpg'}
                                        alt={content.body || 'Sticker'}
                                        className="max-w-[100px] max-h-[100px] object-contain mb-1"
                                        onError={(e) => {
                                            e.currentTarget.onerror = null;
                                            e.currentTarget.src = '/default-image.jpg';
                                        }}
                                    />
                                </div>
                            ) : (
                                <p className="text-red-500">Não foi possível carregar o sticker</p>
                            )}
                            <p className="text-xs text-gray-500 dark:text-gray-400 text-right">{formatTime(event.getTs())}</p>
                            {renderReactions(eventId)}
                        </div>
                    </div>
                );
            } else if (messageType === 'm.audio') {
                const audioUrl = getMxcUrl(content.url);
                return (
                    <div
                        ref={(el) => { messageRefs.current[eventId] = el; }}
                        className={`flex ${isUserMessage ? 'justify-end' : 'justify-start'} my-1 ${highlightedMessageId === eventId ? 'animate-pulse bg-yellow-100 dark:bg-yellow-900 rounded-xl' : ''}`}
                    >
                        {avatarElement}
                        <div className={`w-fit min-w-14 max-w-lg px-3 pt-2 pb-1 rounded-lg border border-gray-200 dark:border-gray-700 
                            ${isUserMessage ? 'bg-green-100 dark:bg-green-900 text-gray-900 dark:text-gray-100' : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'}`}>
                            {shouldShowUsername && <p className="text-xs font-bold">{displayName}</p>}
                            {replyPreview}
                            {audioUrl ? (
                                <div className="audio-container">
                                    <audio
                                        controls
                                        src={audioUrl}
                                        className="max-w-full rounded mb-2"
                                    >
                                        Seu navegador não suporta o elemento de áudio.
                                    </audio>
                                </div>
                            ) : (
                                <p className="text-red-500">Não foi possível carregar o áudio</p>
                            )}
                            <p className="text-xs text-gray-500 dark:text-gray-400 text-right">{formatTime(event.getTs())}</p>
                            {renderReactions(eventId)}
                        </div>
                    </div>
                );
            }

            return (
                <div
                    ref={(el) => { messageRefs.current[eventId] = el; }}
                    className={`flex ${isUserMessage ? 'justify-end' : 'justify-start'} my-1 ${highlightedMessageId === eventId ? 'animate-pulse bg-yellow-100 dark:bg-yellow-900 rounded-xl' : ''}`}
                >
                    {avatarElement}
                    <div className={`w-fit min-w-14 max-w-lg px-3 pt-2 pb-1 rounded-lg border border-gray-200 dark:border-gray-700 
                        ${isUserMessage ? 'bg-green-100 dark:bg-green-900 text-gray-900 dark:text-gray-100' : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'}`}>
                        {shouldShowUsername && <p className="text-xs font-bold">{displayName}</p>}
                        <p className="break-words text-sm">Mensagem não suportada. Abra seu aplicativo do WhatsApp para ver o conteúdo.</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 text-right">{formatTime(event.getTs())}</p>
                        {renderReactions(eventId)}
                    </div>
                </div>
            );
        }
        return null;
    };

    const handleCloseChat = () => {
        // Only close chat if a room is selected to avoid errors
        if (selectedRoom) {
            handleRoomSelect(null);
        }
    };

    const getWhatsAppNumberForRoom = (room: any) => {
        if (!room) return null;

        const members = room.getJoinedMembers();
        for (const member of members) {
            const userId = member.userId || '';
            if (userId.includes('@whatsapp_')) {
                const phoneMatch = userId.match(/@whatsapp_(\d+):/);
                if (phoneMatch && phoneMatch[1]) {
                    return `WhatsApp (+${phoneMatch[1]})`;
                }
            }
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
        <div className="flex h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-2 dark:border-gray-800 rounded-md">
            <div className="w-1/4 border-r border-gray-200 dark:border-gray-800 flex flex-col">
                <div className="p-3 bg-gray-100 dark:bg-gray-800 flex justify-between items-center">
                    <div className="font-bold">Conversas</div>
                    <button onClick={handleLogout} className="text-sm text-red-600 dark:text-red-400 cursor-pointer hover:dark:text-red-300">
                        Deslogar
                    </button>
                </div>

                <div className="p-2 bg-gray-100 dark:bg-gray-800">
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-2.5 text-gray-500 dark:text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar conversa"
                            className="w-full pl-10 pr-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm focus:outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-y-auto flex-grow">
                    {filteredRooms.length === 0 ? (
                        <p className="p-4 text-center text-gray-500 dark:text-gray-400">
                            Nenhuma sala disponível
                        </p>
                    ) : (
                        <ul>
                            {filteredRooms.map((room) => {
                                const avatarUrl = getRoomAvatarUrl(room);
                                const roomName = room.name || room.roomId;
                                const lastMessage = getLastMessage(room);
                                const isPinned = isPriorityRoom(room);
                                return (
                                    <div
                                        key={room.roomId}
                                        onClick={() => handleRoomSelect(room)}
                                        className={`flex p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 ${selectedRoom?.roomId === room.roomId ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
                                    >
                                        {avatarUrl ? (
                                            <img
                                                src={avatarUrl || '/default-avatar.png'}
                                                alt={roomName}
                                                className="w-12 h-12 rounded-full mr-3 object-cover"
                                                onError={(e) => {
                                                    e.currentTarget.onerror = null;
                                                    e.currentTarget.src = '/default-avatar.png';
                                                }}
                                            />
                                        ) : (
                                            <div
                                                className="w-12 h-12 rounded-full mr-3 flex items-center justify-center text-white"
                                                style={{ backgroundColor: getRoomAvatarUrl(roomName) }}
                                            >
                                                {roomName.substring(0, 2).toUpperCase()}
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center">
                                                    <span className="font-medium truncate">{roomName}</span>
                                                    {isPinned && (
                                                        <Pin size={14} className="ml-1 text-blue-500 rotate-45" />
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex justify-between mt-1">
                                                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{lastMessage || 'Nenhuma mensagem'}</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>

            {selectedRoom ? (
                <div className="flex-1 flex flex-col">
                    <div className="p-3 bg-gray-100 dark:bg-gray-800 flex items-center border-b border-gray-200 dark:border-gray-700">
                        <div className="flex items-center flex-1">
                            {getRoomAvatarUrl(selectedRoom) ? (
                                <img
                                    src={getRoomAvatarUrl(selectedRoom) || '/default-avatar.png'}
                                    alt={selectedRoom.name || selectedRoom.roomId}
                                    className="w-10 h-10 rounded-full mr-3 object-cover"
                                    onError={(e) => {
                                        e.currentTarget.onerror = null;
                                        e.currentTarget.src = '/default-avatar.png';
                                    }}
                                />
                            ) : (
                                <div
                                    className="w-10 h-10 rounded-full mr-3 flex items-center justify-center text-white"
                                    style={{ backgroundColor: getRoomAvatarUrl(selectedRoom.name || selectedRoom.roomId) }}
                                >
                                    {(selectedRoom.name || selectedRoom.roomId).substring(0, 2).toUpperCase()}
                                </div>
                            )}
                            <div>
                                <div className="font-medium">{selectedRoom.name || selectedRoom.roomId}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {getWhatsAppNumberForRoom(selectedRoom) || `${selectedRoom.getJoinedMemberCount()} participantes`}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={handleCloseChat}
                            className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                        >
                            <X size={20} className="text-gray-500 dark:text-gray-400 cursor-pointer" />
                        </button>
                    </div>

                    <div
                        className="flex-1 overflow-y-auto p-4 px-16 bg-[#EFEAE2] dark:bg-[#0B1319]"
                        style={{
                            backgroundImage: "linear-gradient(rgba(239,234,226,0.3), rgba(239,234,226,0.3)), url('/whatsapp-background.png')",
                            backgroundSize: 'contain',
                            backgroundBlendMode: 'overlay',
                            backgroundPosition: 'center',
                            backgroundRepeat: 'repeat',
                        }}
                    >
                        {messages.length === 0 ? (
                            <p className="text-center text-gray-500 dark:text-gray-400 my-4">Nenhuma mensagem</p>
                        ) : (
                            <div className="space-y-1">
                                {messages.map((event, index) => (
                                    <div key={event.getId() || index}>{renderMessage(event)}</div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>
                        )}
                    </div>

                    <div className="p-3 bg-gray-100 dark:bg-gray-800 flex items-center">
                        <button className="focus:outline-none mr-2">
                            <Smile size={24} className="text-gray-500 dark:text-gray-400 cursor-pointer" />
                        </button>

                        <div className="flex-1">
                            <input
                                type="text"
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                placeholder="Digite uma mensagem..."
                                className="w-full p-2 bg-white dark:bg-gray-700 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none"
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendMessage(e as any);
                                    }
                                }}
                            />
                        </div>

                        <button
                            onClick={handleSendMessage}
                            className="focus:outline-none ml-2"
                        >
                            {newMessage.trim() ? (
                                <SendHorizonal size={24} className="text-green-500 cursor-pointer" />
                            ) : (
                                <Mic size={24} className="text-gray-500 dark:text-gray-400 cursor-pointer" />
                            )}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400">
                    <div className="text-center">
                        <div className="text-lg mb-2">Selecione um chat para ver as mensagens</div>
                        <div className="text-sm">Clique em um chat na lista ao lado</div>
                    </div>
                </div>
            )}

            {expandedImage && (
                <div
                    className="fixed inset-0 bg-white/90 dark:bg-black/90 z-50 flex items-center justify-center p-4"
                    onClick={closeExpandedImage}
                >
                    <div className="relative max-w-full max-h-full">
                        <button
                            className="absolute top-2 right-2 bg-black bg-opacity-50 rounded-full p-1 text-white hover:bg-opacity-70 cursor-pointer"
                            onClick={(e) => {
                                e.stopPropagation();
                                closeExpandedImage();
                            }}
                        >
                            <X size={24} />
                        </button>
                        <img
                            src={expandedImage}
                            alt="Expanded image"
                            className="max-w-full max-h-[90vh] object-contain"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default function Chat() {
    return (
        <MatrixProvider>
            <ChatUI />
        </MatrixProvider>
    );
}