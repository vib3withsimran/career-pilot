import React from 'react';
import {User, Brain, Github, FlaskConical } from 'lucide-react';

export default function About() {
  return (
    <>
    <section className="w-full py-20 px-6 md:px-12 lg:px-24 bg-gradient-to-r from-slate-50 to-purple-50 overflow-hidden">
    
       <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-12 md:gap-20">
        
        {/* Left Side: Visual / Avatar */}
        <div className="w-full md:w-1/2 flex justify-center">
          <div className="relative group">
            
            <div className="absolute -inset-2 bg-gradient-to-r from-pink-300 via-purple-300 to-indigo-300 rounded-full blur-lg opacity-30 group-hover:opacity-80 transition duration-700 ease-in-out"></div>
            
            {/* Avatar Container */}
            <div className="relative w-64 h-64 md:w-80 md:h-80 bg-white rounded-full border border-slate-200 shadow-lg flex items-center justify-center overflow-hidden">
                
                <User size={120} className="text-pink-200" strokeWidth={1.5} />
            </div>
          </div>
        </div>

        {/* Right Side: Content & Text */}
        <div className="w-full md:w-1/2 text-center md:text-left space-y-6">
          
          {/* Soft Badge */}
          <div className="inline-block px-4 py-1.5 rounded-full bg-white/60 backdrop-blur-sm border border-pink-100 shadow-sm text-pink-500 font-medium text-sm tracking-wide">
            Get to know me
          </div>
          
          <h2 className="text-4xl md:text-5xl font-extrabold text-slate-700 tracking-tight">
            About Me
          </h2>
          
          <p className="text-lg text-slate-500 leading-relaxed">
            Currently exploring React, Tailwind CSS, and improving my problem solving skills through competitive programming.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
            
            {/* Card 1 */}
            <div className="flex items-center gap-4 p-4 bg-white/50 backdrop-blur-md rounded-2xl border border-white/80 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1 cursor-default">
              <div className="p-3 bg-indigo-100 text-indigo-500 rounded-xl">
                <Brain size={20} />
              </div>
              <div className="text-left">
                <h4 className="font-semibold text-slate-700 text-sm">Problem Solving</h4>
                <p className="text-xs text-slate-400">DSA & logical thinking</p>
              </div>
            </div>

            {/* Card 2 */}
            <div className="flex items-center gap-4 p-4 bg-white/50 backdrop-blur-md rounded-2xl border border-white/80 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1 cursor-default">
              <div className="p-3 bg-teal-100 text-teal-500 rounded-xl">
                <Github size={20} />
              </div>
              <div className="text-left">
                <h4 className="font-semibold text-slate-700 text-sm">Open Source</h4>
                <p className="text-xs text-slate-400">Learning through contribution</p>
              </div>
            </div>
            
            {/* Card 3 */}
            <div className="flex items-center gap-4 p-4 bg-white/50 backdrop-blur-md rounded-2xl border border-white/80 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1 cursor-default">
              <div className="p-3 bg-rose-100 text-rose-500 rounded-xl">
                <FlaskConical size={20} />
              </div>
              <div className="text-left">
                <h4 className="font-semibold text-slate-700 text-sm">Research Projects</h4>
                <p className="text-xs text-slate-400">Exploring AI & data science</p>
              </div>
            </div>

          </div>
        </div>

      </div>
    </section>
  </>
  );
}