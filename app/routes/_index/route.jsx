import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0b',
      color: '#e8e8ec',
      fontFamily: 'Geist Mono, monospace',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        maxWidth: '800px',
        width: '100%',
        textAlign: 'center'
      }}>
        {/* Logo */}
        <div style={{
          fontFamily: 'Syne, sans-serif',
          fontSize: '48px',
          fontWeight: '800',
          letterSpacing: '-0.02em',
          marginBottom: '16px',
          background: 'linear-gradient(135deg, #00e676 0%, #448aff 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextColor: 'transparent',
          backgroundClip: 'text'
        }}>
          PRED<span style={{ color: '#00e676' }}>▲</span>TOR
        </div>

        <div style={{
          fontSize: '11px',
          color: '#8888a0',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          marginBottom: '40px',
          fontWeight: '600'
        }}>
          Autonomous Product Engine for Shopify
        </div>

        {/* Main card */}
        <div style={{
          background: '#111113',
          border: '1px solid #2a2a32',
          borderRadius: '16px',
          padding: '40px',
          marginBottom: '32px'
        }}>
          <h2 style={{
            fontFamily: 'Syne, sans-serif',
            fontSize: '24px',
            fontWeight: '700',
            marginBottom: '16px',
            color: '#e8e8ec'
          }}>
            Automate Your Entire Product Lifecycle
          </h2>

          <p style={{
            fontSize: '14px',
            color: '#8888a0',
            lineHeight: '1.6',
            marginBottom: '32px'
          }}>
            AI-powered sourcing, negotiation, pricing, and listing generation —
            all autonomously managed from a single dashboard.
          </p>

          {showForm && (
            <Form method="post" action="/auth/login" style={{
              marginBottom: '32px'
            }}>
              <div style={{
                display: 'flex',
                gap: '12px',
                maxWidth: '400px',
                margin: '0 auto'
              }}>
                <input
                  type="text"
                  name="shop"
                  placeholder="your-store.myshopify.com"
                  style={{
                    flex: 1,
                    background: '#18181c',
                    border: '1px solid #2a2a32',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    color: '#e8e8ec',
                    fontFamily: 'Geist Mono, monospace',
                    fontSize: '13px',
                    outline: 'none',
                    transition: 'border-color 0.15s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#00e676'}
                  onBlur={(e) => e.target.style.borderColor = '#2a2a32'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.target.style.borderColor = '#00e676';
                    }
                  }}
                />
                <button
                  type="submit"
                  style={{
                    background: '#00e676',
                    color: '#000',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '12px 24px',
                    fontFamily: 'Geist Mono, monospace',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'background 0.15s'
                  }}
                  onMouseOver={(e) => e.target.style.background = '#00c853'}
                  onMouseOut={(e) => e.target.style.background = '#00e676'}
                  onFocus={(e) => e.target.style.background = '#00c853'}
                  onBlur={(e) => e.target.style.background = '#00e676'}
                >
                  Connect
                </button>
              </div>
            </Form>
          )}

          {/* Features grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '16px',
            marginTop: '32px'
          }}>
            {[
              { icon: '🎯', title: 'AI Sourcing', desc: 'TikTok, AliExpress, Reddit, Google Trends' },
              { icon: '🤝', title: 'Auto Negotiate', desc: 'AI-powered supplier deal optimization' },
              { icon: '💰', title: 'Dynamic Pricing', desc: 'Surge, undercut, psychological pricing' },
              { icon: '✨', title: 'AI Listings', desc: 'SEO-optimized descriptions & copy' },
              { icon: '🚀', title: 'One-Click Import', desc: 'Direct Shopify product creation' },
              { icon: '📊', title: 'Drop Manager', desc: 'Schedule & automate product drops' }
            ].map((feature, i) => (
              <div key={i} style={{
                background: '#18181c',
                border: '1px solid #2a2a32',
                borderRadius: '10px',
                padding: '20px',
                textAlign: 'left',
                transition: 'all 0.15s',
                cursor: 'default'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = '#00e676';
                e.currentTarget.style.background = '#00e67612';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = '#2a2a32';
                e.currentTarget.style.background = '#18181c';
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#00e676';
                e.currentTarget.style.background = '#00e67612';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#2a2a32';
                e.currentTarget.style.background = '#18181c';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  // Handle keyboard interaction if needed
                }
              }}
              role="button"
              tabIndex={0}
              >
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>{feature.icon}</div>
                <div style={{
                  fontFamily: 'Syne, sans-serif',
                  fontSize: '13px',
                  fontWeight: '600',
                  marginBottom: '6px',
                  color: '#e8e8ec'
                }}>
                  {feature.title}
                </div>
                <div style={{
                  fontSize: '11px',
                  color: '#8888a0',
                  lineHeight: '1.4'
                }}>
                  {feature.desc}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div style={{
          display: 'flex',
          gap: '24px',
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          {[
            { label: 'Products Sourced', value: '10K+' },
            { label: 'Suppliers Negotiated', value: '2.5K+' },
            { label: 'Active Stores', value: '500+' },
            { label: 'Revenue Generated', value: '$2.5M+' }
          ].map((stat, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily: 'Syne, sans-serif',
                fontSize: '24px',
                fontWeight: '700',
                color: '#00e676',
                marginBottom: '4px'
              }}>
                {stat.value}
              </div>
              <div style={{
                fontSize: '11px',
                color: '#8888a0',
                textTransform: 'uppercase',
                letterSpacing: '0.08em'
              }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: '40px',
          fontSize: '11px',
          color: '#4a4a60'
        }}>
          Powered by AI • Built for Shopify • Engineered for Scale
        </div>
      </div>
    </div>
  );
}
