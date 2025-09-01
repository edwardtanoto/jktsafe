'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  isLoading?: boolean;
}

interface ChatResponse {
  text: string;
  eventsCount: number;
  timestamp: string;
  error?: boolean;
}

export default function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Halo! Saya adalah asisten Safe Indonesia. Anda bisa bertanya tentang demonstrasi, kerusuhan, atau situasi keamanan terkini. Coba tanyakan "ada demo dimana?" Berikan hoax tersebar hari ini.',
      sender: 'bot',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputValue.trim(),
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    // Add loading message
    const loadingMessage: Message = {
      id: `loading-${Date.now()}`,
      text: 'Sedang memproses...',
      sender: 'bot',
      timestamp: new Date(),
      isLoading: true
    };

    setMessages(prev => [...prev, loadingMessage]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.text,
          context: {
            currentView: 'jakarta',
            timeRange: 'last_48h'
          }
        }),
      });

      const data = await response.json();

      // Remove loading message and add actual response
      setMessages(prev => prev.filter(msg => !msg.isLoading));

      if (data.success) {
        const botResponse: Message = {
          id: `response-${Date.now()}`,
          text: data.response.text,
          sender: 'bot',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, botResponse]);
      } else {
        const errorResponse: Message = {
          id: `error-${Date.now()}`,
          text: 'Maaf, terjadi kesalahan. Silakan coba lagi.',
          sender: 'bot',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorResponse]);
      }

    } catch (error) {
      console.error('Chat error:', error);
      // Remove loading message
      setMessages(prev => prev.filter(msg => !msg.isLoading));

      const errorResponse: Message = {
        id: `error-${Date.now()}`,
        text: 'Maaf, tidak dapat terhubung ke server. Periksa koneksi internet Anda.',
        sender: 'bot',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorResponse]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <>
      {/* Chat Toggle Button */}
      <div
        style={{
          position: 'fixed',
          bottom: '20px',
          left: '20px',
          zIndex: 1000,
          fontFamily: '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}
      >
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            backgroundColor: isOpen ? '#6b7280' : '#000000',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            color: '#ffffff',
            fontSize: '24px',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(10px)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 6px 25px rgba(0, 0, 0, 0.5)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.4)';
          }}
        >
          {isOpen ? '✕' : '💬'}
        </button>
      </div>

      {/* Chat Window */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: '100px',
            left: '20px',
            width: isMobile ? '300px' : '420px',
            height: isMobile ? '500px' : '400px',
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            backdropFilter: 'blur(15px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            fontFamily: '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: isMobile ? '12px 16px' : '16px 20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              backgroundColor: 'rgba(255, 255, 255, 0.05)'
            }}
          >
            {isMobile && (
              <div style={{
                textAlign: 'center',
                marginBottom: '12px',
                paddingBottom: '8px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <h2 style={{
                  margin: '0',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#ffffff'
                }}>
                  Safe Indonesia Chat
                </h2>
                <p style={{
                  margin: '4px 0 0 0',
                  fontSize: '10px',
                  color: '#9ca3af'
                }}>
                  Tanyakan tentang situasi keamanan terkini
                </p>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '10px' }}>
              <span style={{ fontSize: isMobile ? '16px' : '18px' }}>🤖</span>
              <div>
                <h3 style={{
                  margin: '0 0 2px 0',
                  fontSize: isMobile ? '14px' : '16px',
                  fontWeight: '600',
                  color: '#ffffff'
                }}>
                  Safe Indonesia AI
                </h3>
                <p style={{
                  margin: '0',
                  fontSize: isMobile ? '10px' : '12px',
                  color: '#9ca3af'
                }}>
                  Asisten Keamanan
                </p>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: isMobile ? '12px' : '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: isMobile ? '8px' : '12px'
            }}
          >
            {messages.map((message) => (
              <div
                key={message.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: message.sender === 'user' ? 'flex-end' : 'flex-start',
                  gap: '4px'
                }}
              >
                <div
                  style={{
                    maxWidth: '80%',
                    padding: isMobile ? '8px 12px' : '12px 16px',
                    borderRadius: isMobile ? '12px' : '16px',
                    backgroundColor: message.sender === 'user'
                      ? 'rgba(59, 130, 246, 0.8)'
                      : 'rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    fontSize: isMobile ? '12px' : '14px',
                    lineHeight: '1.4',
                    wordWrap: 'break-word',
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  {message.isLoading ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: isMobile ? '20px' : '24px',
                          height: isMobile ? '20px' : '24px',
                          border: '2px solid rgba(255, 255, 255, 0.2)',
                          borderTop: '2px solid #10b981',
                          borderRight: '2px solid #10b981',
                          borderRadius: '50%',
                          animation: 'spinGlow 1.2s linear infinite',
                          boxShadow: '0 0 10px rgba(16, 185, 129, 0.5)'
                        }}
                      />
                      <div
                        style={{
                          display: 'flex',
                          gap: '4px',
                          alignItems: 'center'
                        }}
                      >
                        <span style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>
                          {message.text}
                        </span>
                        <div style={{ display: 'flex', gap: '2px' }}>
                          <div
                            style={{
                              width: '4px',
                              height: '4px',
                              backgroundColor: '#10b981',
                              borderRadius: '50%',
                              animation: 'bounce 1.4s ease-in-out infinite'
                            }}
                          />
                          <div
                            style={{
                              width: '4px',
                              height: '4px',
                              backgroundColor: '#10b981',
                              borderRadius: '50%',
                              animation: 'bounce 1.4s ease-in-out infinite 0.2s'
                            }}
                          />
                          <div
                            style={{
                              width: '4px',
                              height: '4px',
                              backgroundColor: '#10b981',
                              borderRadius: '50%',
                              animation: 'bounce 1.4s ease-in-out infinite 0.4s'
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    message.sender === 'bot' ? (
                      <ReactMarkdown
                        components={{
                          a: ({ href, children }) => (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: '#60a5fa',
                                textDecoration: 'underline'
                              }}
                            >
                              {children}
                            </a>
                          ),
                          p: ({ children }) => (
                            <span style={{ margin: 0, padding: 0 }}>
                              {children}
                            </span>
                          )
                        }}
                      >
                        {message.text}
                      </ReactMarkdown>
                    ) : (
                      message.text
                    )
                  )}
                </div>
                <span
                  style={{
                    fontSize: isMobile ? '8px' : '10px',
                    color: '#9ca3af',
                    padding: message.sender === 'user' ? 
                      (isMobile ? '0 12px 0 0' : '0 16px 0 0') : 
                      (isMobile ? '0 0 0 12px' : '0 0 0 16px')
                  }}
                >
                  {formatTime(message.timestamp)}
                </span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div
            style={{
              padding: isMobile ? '12px' : '16px',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              backgroundColor: 'rgba(255, 255, 255, 0.05)'
            }}
          >
            <div style={{ display: 'flex', gap: isMobile ? '6px' : '8px' }}>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={isMobile ? "Tanyakan situasi keamanan..." : "Tanyakan tentang situasi keamanan..."}
                disabled={isLoading}
                style={{
                  flex: 1,
                  padding: isMobile ? '10px 14px' : '12px 16px',
                  borderRadius: isMobile ? '20px' : '24px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  color: '#ffffff',
                  fontSize: isMobile ? '12px' : '14px',
                  outline: 'none',
                  fontFamily: 'inherit'
                }}
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isLoading}
                style={{
                  width: isMobile ? '36px' : '44px',
                  height: isMobile ? '36px' : '44px',
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: (!inputValue.trim() || isLoading) ? '#6b7280' : '#10b981',
                  color: '#ffffff',
                  fontSize: isMobile ? '14px' : '16px',
                  cursor: (!inputValue.trim() || isLoading) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  boxShadow: isLoading ? '0 0 15px rgba(107, 114, 128, 0.6)' : '0 0 15px rgba(16, 185, 129, 0.4)'
                }}
              >
                {isLoading ? (
                  <div
                    style={{
                      width: isMobile ? '16px' : '20px',
                      height: isMobile ? '16px' : '20px',
                      border: '2px solid rgba(255, 255, 255, 0.3)',
                      borderTop: '2px solid #ffffff',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite'
                    }}
                  />
                ) : '📤'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animation Styles */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          @keyframes spinGlow {
            0% { 
              transform: rotate(0deg);
              box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
            }
            50% { 
              box-shadow: 0 0 20px rgba(16, 185, 129, 0.8);
            }
            100% { 
              transform: rotate(360deg);
              box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
            }
          }
          
          @keyframes pulse {
            0%, 100% { 
              opacity: 0.7;
              transform: scale(1);
            }
            50% { 
              opacity: 1;
              transform: scale(1.02);
            }
          }
          
          @keyframes bounce {
            0%, 80%, 100% { 
              transform: scale(0.8);
              opacity: 0.5;
            }
            40% { 
              transform: scale(1.2);
              opacity: 1;
            }
          }
        `
      }} />
    </>
  );
}
