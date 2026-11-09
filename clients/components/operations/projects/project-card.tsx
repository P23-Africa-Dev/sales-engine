"use client";

import { MoreVertical } from "lucide-react";
import { Project } from "@/types/operations";
import { getStatusClassName, getPriorityClassName } from "./utils";

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
}

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  return (
    <div className="relative pb-5">
      <div
        className="bg-white rounded-3xl p-5 pt-6 border border-gray-100/80 transition-all"
        style={{ boxShadow: "0px 1px 2px 2px #00000026" }}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[15px] font-bold text-[#09232D] leading-snug">
            {project.name}
          </h3>
          <button className="text-gray-300 hover:text-gray-500 transition-colors mt-0.5 shrink-0">
            <MoreVertical size={18} />
          </button>
        </div>

        <p className="text-[11px] text-gray-400 leading-relaxed line-clamp-3 mt-1.5">
          {project.description}
        </p>

        <p className="text-[11px] font-semibold text-gray-400 mt-3">
          {project.deadline}
        </p>

        <div className="flex items-center gap-2 mt-3">
          <span
            className={`px-3 py-1 rounded-full text-[10px] font-bold ${getStatusClassName(project.status)}`}
          >
            {project.status}
          </span>
          <span
            className={`px-3 py-1 rounded-full text-[10px] font-bold ${getPriorityClassName(project.priority)}`}
          >
            {project.priority}
          </span>
        </div>

        <div className="flex gap-2 mt-4">
          <div className="flex-1 min-w-0">
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#6B9A9A] rounded-full"
                style={{ width: `${project.completedPercent}%` }}
              />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#F87171] rounded-full"
                style={{ width: `${project.pendingPercent}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-1.5 mb-3">
          <span className="flex-1 text-[10px] font-semibold text-gray-400">
            Completed
          </span>
          <span className="flex-1 text-[10px] font-semibold text-gray-400">
            Pending
          </span>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 flex justify-center">
        <button
          onClick={onClick}
          className="px-10 py-3 bg-[#09232D] text-white rounded-full text-[12px] font-bold hover:opacity-90 active:scale-[0.98] transition-all shadow-md"
        >
          View Project
        </button>
      </div>
    </div>
  );
}
