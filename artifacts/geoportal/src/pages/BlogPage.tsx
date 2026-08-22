import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, ArrowRight, TrendingUp, BookOpen, ArrowLeft, Loader2 } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { api } from "@/lib/api";
import { StoryMapViewer } from "@/components/StoryMapViewer";

export function BlogPage() {
  const [activeArticleId, setActiveArticleId] = useState<number | null>(null);
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.blog.list();
        // sort by newest
        const sorted = res.posts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setArticles(sorted);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const activeArticle = articles.find(a => a.id === activeArticleId);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
              <img src="/logo.png" alt="SPETRO Logo" className="h-10 w-auto object-contain shrink-0 drop-shadow-md rounded-md" />
              <div>
                <h1 className="font-bold text-lg leading-tight tracking-wide text-foreground">SPETRO</h1>
                <p className="text-[10px] font-medium tracking-widest text-emerald-600 uppercase">Geoportal Analysis</p>
              </div>
            </div>
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/auth">
            <Button variant="outline" size="sm">Sign In / Create Account</Button>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto p-6 md:p-10 space-y-8">
        
        {activeArticle ? (
          (() => {
            let isStoryMap = false;
            try {
              const parsed = JSON.parse(activeArticle.content);
              isStoryMap = parsed.type === "storymap";
            } catch (e) {}
            
            if (isStoryMap) {
              return <StoryMapViewer article={activeArticle} onBack={() => setActiveArticleId(null)} />;
            }
            
            return (
              <div className="space-y-6 max-w-5xl mx-auto pb-12 pt-4">
                <Button variant="ghost" className="mb-4 text-muted-foreground hover:text-primary gap-2 pl-0" onClick={() => setActiveArticleId(null)}>
                  <ArrowLeft className="w-4 h-4" /> Back to Articles
                </Button>
                <div className="flex items-center gap-3 mb-6">
                  <Badge variant="secondary" className="px-3 py-1 text-sm">{activeArticle.category}</Badge>
                  <span className="text-muted-foreground text-base flex items-center gap-1">
                    <Calendar className="w-4 h-4" /> {new Date(activeArticle.timestamp).toLocaleDateString()}
                  </span>
                  <span className="text-muted-foreground text-base flex items-center gap-1">
                    <BookOpen className="w-4 h-4" /> {activeArticle.read_time || "5 min read"}
                  </span>
                </div>
                <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-tight mb-8">
                  {activeArticle.title}
                </h1>
                <div className="rounded-3xl overflow-hidden shadow-2xl border border-border mb-16">
                  <img 
                    src={activeArticle.image_url || "/placeholder-image.jpg"} 
                    alt={activeArticle.title}
                    className="w-full h-[500px] md:h-[700px] object-cover"
                  />
                </div>
                <div className="prose prose-xl dark:prose-invert max-w-none text-muted-foreground leading-relaxed text-xl" dangerouslySetInnerHTML={{ __html: activeArticle.content }} />
              </div>
            );
          })()
        ) : (
          <>
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b">
          <div className="space-y-2">
            <div className="inline-flex items-center rounded-lg bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              <TrendingUp className="mr-2 h-4 w-4" />
              News & Updates
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Blog & Case Studies</h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              Read how researchers, planners, and businesses are using SPETRO to solve real-world problems.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center p-20 border border-border/50 rounded-2xl bg-card">
            <h2 className="text-2xl font-bold mb-2">No articles found</h2>
            <p className="text-muted-foreground">Check back later for news and updates.</p>
          </div>
        ) : (
          <>
            {/* Featured Article */}
            <div 
              className="relative rounded-2xl overflow-hidden border border-border shadow-md group cursor-pointer"
              onClick={() => setActiveArticleId(articles[0].id)}
            >
              <div className="absolute inset-0 bg-black/40 z-10 transition-colors group-hover:bg-black/50" />
              <img 
                src={articles[0].image_url || "/placeholder-image.jpg"} 
                alt={articles[0].title}
                className="w-full h-[400px] object-cover group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute bottom-0 left-0 right-0 p-8 z-20 bg-gradient-to-t from-black/90 via-black/60 to-transparent">
                <div className="max-w-3xl">
                  <div className="flex items-center gap-3 mb-4">
                    <Badge className="bg-primary hover:bg-primary/90 text-primary-foreground">{articles[0].category}</Badge>
                    <span className="text-white/80 text-sm flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" /> {new Date(articles[0].timestamp).toLocaleDateString()}
                    </span>
                    <span className="text-white/80 text-sm flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5" /> {articles[0].read_time || "5 min read"}
                    </span>
                  </div>
                  <h2 className="text-3xl md:text-4xl font-bold text-white mb-3 leading-tight group-hover:text-primary transition-colors">
                    {articles[0].title}
                  </h2>
                  <p className="text-white/90 text-lg md:text-xl line-clamp-2 mb-6">
                    {articles[0].excerpt}
                  </p>
                  <Button variant="default" className="gap-2">
                    Read Full Case Study <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Grid of Articles */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
              {articles.slice(1).map((article) => (
                <Card 
                  key={article.id} 
                  className="flex flex-col overflow-hidden hover:shadow-lg transition-all duration-300 group cursor-pointer border-border/50"
                  onClick={() => setActiveArticleId(article.id)}
                >
                  <div className="aspect-video relative overflow-hidden bg-muted">
                    <img 
                      src={article.image_url || "/placeholder-image.jpg"} 
                      alt={article.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute top-4 left-4">
                      <Badge variant="secondary" className="bg-background/90 backdrop-blur-sm shadow-sm">{article.category}</Badge>
                    </div>
                  </div>
                  <CardHeader className="flex-1">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(article.timestamp).toLocaleDateString()}</span>
                      <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> {article.read_time || "5 min read"}</span>
                    </div>
                    <CardTitle className="text-xl leading-tight group-hover:text-primary transition-colors mb-2">
                      {article.title}
                    </CardTitle>
                    <CardDescription className="text-sm line-clamp-3">
                      {article.excerpt}
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className="pt-0">
                    <Button variant="ghost" className="p-0 text-primary hover:bg-transparent hover:text-primary/80 gap-2">
                      Read Article <ArrowRight className="w-4 h-4" />
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </>
        )}
        </>
        )}
      </main>

      {/* Global Footer */}
      <footer className="bg-card border-t border-border mt-auto w-full">
        <div className="max-w-6xl mx-auto px-8 py-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="SPETRO Logo" className="h-6 w-auto object-contain rounded" />
            <span className="font-semibold text-foreground text-sm tracking-wide">SPETRO Analysis</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © 2026 SPETRO. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
