import React from 'react'

interface LandingPageProps {
  onNavigate: (route: string) => void;
}

export default function LandingPage({ onNavigate }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gray-900 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <span className="text-lg font-bold text-gray-900 tracking-tight">
                Studio Editor
              </span>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => onNavigate('login')}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                Log in
              </button>
              <button 
                onClick={() => onNavigate('signup')}
                className="text-sm bg-gray-900 text-white px-5 py-2 rounded-xl hover:bg-gray-800 transition-all font-medium active:scale-95 shadow-sm"
              >
                Sign up
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="flex-1 bg-white relative overflow-hidden flex items-center">
        <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-30"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 py-16 sm:py-24 lg:py-32 flex flex-col items-center text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-extrabold text-gray-900 tracking-tight mb-6 max-w-4xl">
            Visualize Your Walls & Floors <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-500">Instantly</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-500 mb-10 max-w-2xl leading-relaxed">
            Upload a photo of your room, instantly apply stunning premium textures, and see your dream interior come to life before making any real-world changes.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <button 
              onClick={() => onNavigate('login')}
              className="bg-gray-900 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-gray-800 transition-all shadow-xl hover:shadow-2xl active:scale-95 flex items-center justify-center gap-2"
            >
              Get Started
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </button>
            <button 
              onClick={() => onNavigate('home')}
              className="bg-white text-gray-900 border-2 border-gray-200 px-8 py-4 rounded-2xl font-bold text-lg hover:border-gray-900 hover:bg-gray-50 transition-all active:scale-95"
            >
              Try Visualizer
            </button>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="bg-[#f8f9fa] py-20 border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Professional Grade Tools</h2>
            <p className="text-gray-500">Everything you need to design your perfect space.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard 
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />}
              title="Upload Room Photo"
              description="Start by uploading any high-quality photo of your own room."
            />
            <FeatureCard 
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />}
              title="Apply Textures"
              description="Click exactly where you want to apply premium wall and floor textures."
            />
            <FeatureCard 
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />}
              title="Realistic Preview"
              description="Our AI automatically blends lighting, shadows, and depth flawlessly."
            />
            <FeatureCard 
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />}
              title="Easy Comparison"
              description="Toggle between your original photo and the new rendered design."
            />
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="bg-white py-20 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">How It Works</h2>
            <p className="text-gray-500">Three simple steps to redesign your room.</p>
          </div>
          <div className="flex flex-col md:flex-row justify-center items-center gap-8 md:gap-4 relative">
            {/* Connecting Line */}
            <div className="hidden md:block absolute top-1/2 left-0 right-0 h-0.5 bg-gray-100 -z-10 -translate-y-1/2"></div>
            
            <Step number="1" title="Upload Image" text="Drop a photo of your space into the editor." />
            <Step number="2" title="Choose Texture" text="Pick a premium material from the product catalog." />
            <Step number="3" title="Instant Results" text="Watch the AI perfectly blend the new design." />
          </div>
        </div>
      </div>
    </div>
  )
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
      <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-900 mb-6">
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">{icon}</svg>
      </div>
      <h3 className="text-xl font-bold text-gray-900 mb-3">{title}</h3>
      <p className="text-gray-500 leading-relaxed">{description}</p>
    </div>
  )
}

function Step({ number, title, text }: { number: string, title: string, text: string }) {
  return (
    <div className="bg-white w-full md:w-1/3 flex flex-col items-center text-center p-6">
      <div className="w-16 h-16 bg-gray-900 text-white rounded-full flex items-center justify-center text-2xl font-bold shadow-lg mb-6 ring-8 ring-white">
        {number}
      </div>
      <h3 className="text-xl font-bold text-gray-900 mb-3">{title}</h3>
      <p className="text-gray-500">{text}</p>
    </div>
  )
}
