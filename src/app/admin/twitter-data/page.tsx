'use client';

import { useEffect, useState } from 'react';

interface TwitterData {
  id: number;
  tweetId: string;
  text: string;
  createdAt: string;
  socialMetrics: {
    bookmarks: number;
    favorites: number;
    retweets: number;
    views: string;
    quotes: number;
    replies: number;
  };
  userInfo: {
    created_at: string;
    followers_count: number;
    friends_count: number;
    favourites_count: number;
    verified: boolean;
  };
  location: {
    extractedLocation: string | null;
    lat: number | null;
    lng: number | null;
    confidenceScore: number | null;
  };
  status: {
    verified: boolean;
    processedAt: string;
    updatedAt: string;
  };
}

export default function TwitterDataPage() {
  const [data, setData] = useState<TwitterData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'processed' | 'unprocessed'>('all');

  const fetchData = async (filterType: string) => {
    try {
      setLoading(true);
      const processedParam = filterType === 'processed' ? 'true' : filterType === 'unprocessed' ? 'false' : '';
      const response = await fetch(`/api/twitter/data?limit=50${processedParam ? `&processed=${processedParam}` : ''}`);
      const result = await response.json();
      
      if (result.success) {
        setData(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch Twitter data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(filter);
  }, [filter]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const calculateAccountAge = (createdAt: string) => {
    const created = new Date(createdAt);
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    return diffInDays;
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'IBM Plex Sans, sans-serif' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '10px' }}>
          🐦 Twitter Data Dashboard
        </h1>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          View and analyze Twitter data from &quot;rencana demo&quot; searches
        </p>

        {/* Filter Buttons */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          {(['all', 'processed', 'unprocessed'] as const).map((filterType) => (
            <button
              key={filterType}
              onClick={() => setFilter(filterType)}
              style={{
                padding: '8px 16px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                backgroundColor: filter === filterType ? '#007bff' : '#fff',
                color: filter === filterType ? '#fff' : '#333',
                cursor: 'pointer',
                fontSize: '14px',
                textTransform: 'capitalize'
              }}
            >
              {filterType} ({filterType === 'all' ? data.length : 
                filterType === 'processed' ? data.filter(d => d.location.extractedLocation).length :
                data.filter(d => !d.location.extractedLocation).length})
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '18px' }}>Loading Twitter data...</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {data.map((tweet) => {
            const accountAge = calculateAccountAge(tweet.userInfo.created_at);
            const followerRatio = tweet.userInfo.friends_count > 0 ? 
              (tweet.userInfo.followers_count / tweet.userInfo.friends_count) : 0;
            const isLikelyBot = accountAge < 30 || followerRatio < 0.1 || 
              tweet.userInfo.friends_count > tweet.userInfo.followers_count * 5;

            return (
              <div
                key={tweet.id}
                style={{
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  padding: '16px',
                  backgroundColor: tweet.location.extractedLocation ? '#f8fff8' : '#fff8f8'
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div>
                    <strong>Tweet #{tweet.id}</strong>
                    <span style={{ color: '#666', marginLeft: '8px' }}>
                      ID: {tweet.tweetId}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {formatDate(tweet.createdAt)}
                  </div>
                </div>

                {/* Tweet Text */}
                <div style={{ 
                  backgroundColor: '#f5f5f5', 
                  padding: '12px', 
                  borderRadius: '6px', 
                  marginBottom: '12px',
                  fontStyle: 'italic'
                }}>
                  &quot;{tweet.text}&quot;
                </div>

                {/* Social Metrics */}
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', 
                  gap: '8px', 
                  marginBottom: '12px',
                  fontSize: '12px'
                }}>
                  <div>👀 {tweet.socialMetrics.views} views</div>
                  <div>🔄 {tweet.socialMetrics.retweets} retweets</div>
                  <div>❤️ {tweet.socialMetrics.favorites} likes</div>
                  <div>💬 {tweet.socialMetrics.replies} replies</div>
                  <div>📝 {tweet.socialMetrics.quotes} quotes</div>
                  <div>🔖 {tweet.socialMetrics.bookmarks} bookmarks</div>
                </div>

                {/* User Info & Bot Detection */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '8px',
                  backgroundColor: isLikelyBot ? '#fee2e2' : '#f0f9ff',
                  borderRadius: '4px',
                  marginBottom: '12px',
                  fontSize: '12px'
                }}>
                  <div>
                    <strong>{isLikelyBot ? '🤖 Potential Bot' : '👤 User Account'}</strong>
                    <div>Age: {accountAge} days | Followers: {tweet.userInfo.followers_count?.toLocaleString()} | Following: {tweet.userInfo.friends_count?.toLocaleString()}</div>
                  </div>
                  {tweet.userInfo.verified && <div style={{ color: '#1d4ed8' }}>✅ Verified</div>}
                </div>

                {/* Location Info */}
                {tweet.location.extractedLocation ? (
                  <div style={{ 
                    backgroundColor: '#dcfce7', 
                    padding: '8px', 
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}>
                    <strong>📍 Location:</strong> {tweet.location.extractedLocation}
                    <br />
                    <strong>🎯 Confidence:</strong> {Math.round((tweet.location.confidenceScore || 0) * 100)}%
                    <br />
                    <strong>🗺️ Coordinates:</strong> {tweet.location.lat?.toFixed(4)}, {tweet.location.lng?.toFixed(4)}
                  </div>
                ) : (
                  <div style={{ 
                    backgroundColor: '#fee2e2', 
                    padding: '8px', 
                    borderRadius: '4px',
                    fontSize: '14px',
                    color: '#991b1b'
                  }}>
                    ❌ No location extracted
                  </div>
                )}

                {/* Status */}
                <div style={{ 
                  marginTop: '8px', 
                  fontSize: '11px', 
                  color: '#666',
                  textAlign: 'right'
                }}>
                  {tweet.status.verified ? '✅ Verified' : '⚠️ Unverified'} | 
                  Updated: {formatDate(tweet.status.updatedAt)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
