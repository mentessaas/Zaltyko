"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SkillProgressData {
  skillName: string;
  dates: string[];
  scores: number[];
}

interface ProgressChartsProps {
  skills: SkillProgressData[];
}

export function ProgressCharts({ skills }: ProgressChartsProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Gráficos de Progreso</CardTitle>
          <CardDescription>Evolución de habilidades a lo largo del tiempo</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {skills.map((skill, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{skill.skillName}</p>
                  <span className="text-sm text-muted-foreground">
                    {skill.scores.length} evaluaciones
                  </span>
                </div>
                {/* Gráfico simple de barras */}
                <div className="flex items-end gap-1 h-32">
                  {skill.scores.map((score, scoreIdx) => (
                    <div
                      key={scoreIdx}
                      className="flex-1 bg-primary rounded-t transition-all hover:bg-primary/80"
                      style={{
                        height: `${(score / 10) * 100}%`,
                      }}
                      title={`${skill.dates[scoreIdx]}: ${score}`}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{skill.dates[0]}</span>
                  <span>{skill.dates[skill.dates.length - 1]}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

