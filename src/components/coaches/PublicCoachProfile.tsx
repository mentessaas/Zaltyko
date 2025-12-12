"use client";

import Image from "next/image";
import Link from "next/link";
import { Mail, Phone, Calendar, Award, Star, Instagram, Facebook, Twitter, Linkedin, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CoachProfileData {
    id: string;
    name: string;
    slug: string;
    photoUrl: string | null;
    publicBio: string | null;
    specialties: string[] | null;
    yearsExperience: string | null;
    certifications: Array<{
        name: string;
        issuer: string;
        date: string;
        url?: string;
    }>;
    achievements: Array<{
        title: string;
        description?: string;
        date?: string;
    }>;
    photoGallery: string[] | null;
    socialLinks?: {
        instagram?: string;
        facebook?: string;
        twitter?: string;
        linkedin?: string;
        website?: string;
    };
    academyName: string;
    academySlug: string;
}

interface PublicCoachProfileProps {
    coach: CoachProfileData;
}

export function PublicCoachProfile({ coach }: PublicCoachProfileProps) {
    const socialIcons = {
        instagram: Instagram,
        facebook: Facebook,
        twitter: Twitter,
        linkedin: Linkedin,
        website: Globe,
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
            {/* Hero Section */}
            <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 to-purple-600 py-20">
                <div className="absolute inset-0 bg-grid-white/10"></div>
                <div className="container relative mx-auto px-4">
                    <div className="flex flex-col items-center gap-8 md:flex-row">
                        {/* Photo */}
                        <div className="relative">
                            <div className="h-48 w-48 overflow-hidden rounded-full border-4 border-white shadow-2xl">
                                {coach.photoUrl ? (
                                    <Image
                                        src={coach.photoUrl}
                                        alt={coach.name}
                                        width={192}
                                        height={192}
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-400 to-purple-400 text-6xl font-bold text-white">
                                        {coach.name.charAt(0)}
                                    </div>
                                )}
                            </div>
                            {coach.yearsExperience && (
                                <div className="absolute -bottom-2 -right-2 rounded-full bg-white px-4 py-2 shadow-lg">
                                    <div className="flex items-center gap-1 text-sm font-semibold text-blue-600">
                                        <Calendar className="h-4 w-4" />
                                        {coach.yearsExperience} años
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 text-center md:text-left">
                            <h1 className="mb-2 text-4xl font-bold text-white md:text-5xl">
                                {coach.name}
                            </h1>
                            <p className="mb-4 text-xl text-blue-100">
                                Coach de Gimnasia Artística
                            </p>

                            {/* Specialties */}
                            {coach.specialties && coach.specialties.length > 0 && (
                                <div className="mb-4 flex flex-wrap justify-center gap-2 md:justify-start">
                                    {coach.specialties.map((specialty, index) => (
                                        <span
                                            key={index}
                                            className="rounded-full bg-white/20 px-4 py-1 text-sm font-medium text-white backdrop-blur-sm"
                                        >
                                            {specialty}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Social Links */}
                            {coach.socialLinks && Object.keys(coach.socialLinks).length > 0 && (
                                <div className="flex justify-center gap-3 md:justify-start">
                                    {Object.entries(coach.socialLinks).map(([platform, url]) => {
                                        if (!url) return null;
                                        const Icon = socialIcons[platform as keyof typeof socialIcons];
                                        return (
                                            <a
                                                key={platform}
                                                href={url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-all hover:bg-white/30 hover:scale-110"
                                            >
                                                <Icon className="h-5 w-5" />
                                            </a>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="container mx-auto px-4 py-12">
                <div className="grid gap-8 lg:grid-cols-3">
                    {/* Main Content */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* Bio */}
                        {coach.publicBio && (
                            <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
                                <h2 className="mb-4 text-2xl font-bold text-slate-900">
                                    Sobre mí
                                </h2>
                                <p className="whitespace-pre-wrap text-slate-600 leading-relaxed">
                                    {coach.publicBio}
                                </p>
                            </section>
                        )}

                        {/* Achievements */}
                        {coach.achievements && coach.achievements.length > 0 && (
                            <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
                                <h2 className="mb-6 flex items-center gap-2 text-2xl font-bold text-slate-900">
                                    <Award className="h-6 w-6 text-yellow-500" />
                                    Logros y Reconocimientos
                                </h2>
                                <div className="space-y-4">
                                    {coach.achievements.map((achievement, index) => (
                                        <div
                                            key={index}
                                            className="border-l-4 border-blue-500 bg-blue-50 p-4 rounded-r-lg"
                                        >
                                            <h3 className="font-semibold text-slate-900">
                                                {achievement.title}
                                            </h3>
                                            {achievement.description && (
                                                <p className="mt-1 text-sm text-slate-600">
                                                    {achievement.description}
                                                </p>
                                            )}
                                            {achievement.date && (
                                                <p className="mt-1 text-xs text-slate-500">
                                                    {achievement.date}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Photo Gallery */}
                        {coach.photoGallery && coach.photoGallery.length > 0 && (
                            <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
                                <h2 className="mb-6 text-2xl font-bold text-slate-900">
                                    Galería
                                </h2>
                                <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                                    {coach.photoGallery.map((photo, index) => (
                                        <div
                                            key={index}
                                            className="aspect-square overflow-hidden rounded-lg"
                                        >
                                            <Image
                                                src={photo}
                                                alt={`Foto ${index + 1}`}
                                                width={300}
                                                height={300}
                                                className="h-full w-full object-cover transition-transform hover:scale-110"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        {/* Certifications */}
                        {coach.certifications && coach.certifications.length > 0 && (
                            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                                <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
                                    <Star className="h-5 w-5 text-blue-500" />
                                    Certificaciones
                                </h3>
                                <div className="space-y-3">
                                    {coach.certifications.map((cert, index) => (
                                        <div
                                            key={index}
                                            className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                                        >
                                            <p className="font-semibold text-slate-900 text-sm">
                                                {cert.name}
                                            </p>
                                            <p className="text-xs text-slate-600">{cert.issuer}</p>
                                            <p className="text-xs text-slate-500">{cert.date}</p>
                                            {cert.url && (
                                                <a
                                                    href={cert.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="mt-1 inline-block text-xs text-blue-600 hover:underline"
                                                >
                                                    Ver certificado →
                                                </a>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Academy Info */}
                        <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 to-purple-50 p-6 shadow-sm">
                            <h3 className="mb-3 text-lg font-bold text-slate-900">
                                Academia
                            </h3>
                            <p className="mb-4 text-slate-700">{coach.academyName}</p>
                            <Link href={`/academies/${coach.academySlug}`}>
                                <Button className="w-full">
                                    Ver Academia
                                </Button>
                            </Link>
                        </section>

                        {/* CTA */}
                        <section className="rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-500 to-purple-600 p-6 text-white shadow-lg">
                            <h3 className="mb-2 text-lg font-bold">
                                ¿Interesado en clases?
                            </h3>
                            <p className="mb-4 text-sm text-blue-100">
                                Contacta con la academia para más información sobre horarios y disponibilidad.
                            </p>
                            <Link href={`/academies/${coach.academySlug}#contact`}>
                                <Button variant="secondary" className="w-full">
                                    Contactar
                                </Button>
                            </Link>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}
