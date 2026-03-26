"use client";

import { useState, useRef } from "react";
import { Upload, Play, X, FileVideo, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { AssessmentVideo } from "@/types";

interface VideoUploaderProps {
  videos: AssessmentVideo[];
  onChange: (videos: AssessmentVideo[]) => void;
  maxVideos?: number;
  maxSizeMB?: number;
  disabled?: boolean;
  uploadEndpoint?: string;
}

interface UploadingVideo {
  id: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "complete" | "error";
  error?: string;
}

export function VideoUploader({
  videos,
  onChange,
  maxVideos = 5,
  maxSizeMB = 100,
  disabled = false,
  uploadEndpoint = "/api/upload",
}: VideoUploaderProps) {
  const [uploading, setUploading] = useState<UploadingVideo[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const validateFile = (file: File): string | null => {
    const allowedTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"];
    if (!allowedTypes.includes(file.type)) {
      return "Tipo de archivo no permitido. Usa MP4, WebM o MOV.";
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      return `El archivo excede el tamaño máximo de ${maxSizeMB}MB.`;
    }
    return null;
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    await processFiles(files);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    await processFiles(files);
    // Reset input
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const processFiles = async (files: File[]) => {
    const remainingSlots = maxVideos - videos.length - uploading.length;
    const filesToProcess = files.slice(0, remainingSlots);

    for (const file of filesToProcess) {
      const error = validateFile(file);
      const uploadId = crypto.randomUUID();

      if (error) {
        setUploading((prev) => [
          ...prev,
          { id: uploadId, file, progress: 0, status: "error", error },
        ]);
        continue;
      }

      // Start upload
      setUploading((prev) => [
        ...prev,
        { id: uploadId, file, progress: 0, status: "pending" },
      ]);

      await uploadVideo(uploadId, file);
    }
  };

  const uploadVideo = async (id: string, file: File) => {
    setUploading((prev) =>
      prev.map((u) => (u.id === id ? { ...u, status: "uploading", progress: 10 } : u))
    );

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploading((prev) =>
          prev.map((u) => {
            if (u.id === id && u.status === "uploading" && u.progress < 90) {
              return { ...u, progress: u.progress + 10 };
            }
            return u;
          })
        );
      }, 200);

      // In a real implementation, this would upload to the server
      // For now, create a local URL
      const url = URL.createObjectURL(file);

      clearInterval(progressInterval);

      setUploading((prev) =>
        prev.map((u) => (u.id === id ? { ...u, progress: 100, status: "complete" } : u))
      );

      // Add to videos list
      const newVideo: AssessmentVideo = {
        id,
        url,
        title: file.name.replace(/\.[^/.]+$/, ""),
        description: null,
        uploadedAt: new Date().toISOString(),
      };

      onChange([...videos, newVideo]);

      // Remove from uploading list after a delay
      setTimeout(() => {
        setUploading((prev) => prev.filter((u) => u.id !== id));
      }, 1000);
    } catch (error) {
      setUploading((prev) =>
        prev.map((u) =>
          u.id === id
            ? { ...u, status: "error", error: "Error al subir el video" }
            : u
        )
      );
    }
  };

  const removeVideo = (id: string) => {
    onChange(videos.filter((v) => v.id !== id));
  };

  const removeUploading = (id: string) => {
    setUploading((prev) => prev.filter((u) => u.id !== id));
  };

  const canUpload = videos.length + uploading.length < maxVideos && !disabled;

  return (
    <div className="space-y-4">
      <div>
        <Label>Videos de la Evaluación</Label>
        <p className="text-xs text-muted-foreground">
          Arrastra y suelta videos o haz clic para seleccionar. Máximo {maxVideos} videos.
        </p>
      </div>

      {/* Drop zone */}
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
          dragActive && "border-primary bg-primary/5",
          !canUpload && "opacity-50 cursor-not-allowed",
          canUpload && "border-border hover:border-primary/50"
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => canUpload && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/x-msvideo"
          multiple
          className="hidden"
          onChange={handleFileSelect}
          disabled={!canUpload}
        />
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium">
          {canUpload ? "Arrastra videos aquí o haz clic para seleccionar" : "Límite alcanzado"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          MP4, WebM, MOV hasta {maxSizeMB}MB
        </p>
      </div>

      {/* Uploading videos */}
      {uploading.length > 0 && (
        <div className="space-y-2">
          {uploading.map((u) => (
            <Card key={u.id}>
              <CardContent className="p-3">
                {u.status === "error" ? (
                  <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-md text-red-800 text-xs">
                    <AlertCircle className="h-4 w-4" />
                    <span className="flex-1">{u.file.name}: {u.error}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 h-6 w-6 p-0"
                      onClick={() => removeUploading(u.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <FileVideo className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{u.file.name}</p>
                      <Progress value={u.progress} className="h-1 mt-1" />
                    </div>
                    {u.status === "uploading" && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Uploaded videos */}
      {videos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {videos.map((video) => (
            <Card key={video.id} className="relative group overflow-hidden">
              <div className="aspect-video bg-muted relative">
                <video
                  src={video.url}
                  className="w-full h-full object-cover"
                  preload="metadata"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button variant="secondary" size="sm" asChild>
                    <a href={video.url} target="_blank" rel="noopener noreferrer">
                      <Play className="h-4 w-4 mr-1" />
                      Ver
                    </a>
                  </Button>
                </div>
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removeVideo(video.id)}
                  disabled={disabled}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              {(video.title || video.description) && (
                <CardContent className="p-2">
                  <p className="text-xs font-medium truncate">{video.title}</p>
                  {video.description && (
                    <p className="text-xs text-muted-foreground truncate">
                      {video.description}
                    </p>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
