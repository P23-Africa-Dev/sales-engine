import React from 'react';

export default function GenericPage({ title }: { title: string }) {
  return (
    <div className="p-12">
      <h1 className="text-4xl font-bold mb-4">{title}</h1>
      <p className="text-white/60">This is the {title} page placeholder.</p>
    </div>
  );
}

// I'll create individual files for each to satisfy the route structure
