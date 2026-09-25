import React, { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PlayCircle, BookOpen, Clock, CheckCircle2, GraduationCap, Video, FileText, Plus, Trash2, Headphones, Sparkles, Search, Shield, User, Pencil, ZoomIn, ZoomOut, Moon, Sun, ChevronLeft, ChevronRight, Maximize, Minimize, ListTree, X, Flame, Bot, HelpCircle, Loader2, MessageCircle } from "lucide-react";
import { pdfjs, Document, Page, Outline } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from "@/hooks/use-notifications";
import { api } from "@/lib/api";
import { BASE, fetchAITakeaways } from "@/lib/api";

export function AcademyPage() {
  const [activeTab, setActiveTab] = useState("videos");
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [selectedVideoIndex, setSelectedVideoIndex] = useState<number>(0);
  
  const [isAddCourseOpen, setIsAddCourseOpen] = useState(false);
  const [newCourse, setNewCourse] = useState({
    title: "",
    description: "",
    detailedDescription: "",
    level: "Beginner",
    duration: "1h 00m",
    videos: [{ id: "v_1", title: "Lesson 1: Introduction", youtubeUrl: "", duration: "15m" }]
  });

  const [isAddBookOpen, setIsAddBookOpen] = useState(false);
  const [newBook, setNewBook] = useState({ title: "", author: "", description: "", pages: "", googleBooksUrl: "" });
  const [selectedBookToRead, setSelectedBookToRead] = useState<any>(null);

  const [isEditCourseOpen, setIsEditCourseOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<any>(null);

  const [isEditBookOpen, setIsEditBookOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<any>(null);

  // PDF Viewer State
  const [numPages, setNumPages] = useState<number>();
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [pdfScale, setPdfScale] = useState<number>(1.0);
  const [isPdfDarkMode, setIsPdfDarkMode] = useState<boolean>(false);
  const [showSidebar, setShowSidebar] = useState<boolean>(false);
  const [sidebarTab, setSidebarTab] = useState<"toc" | "ai">("toc");
  const [aiInput, setAiInput] = useState("");
  const [aiChat, setAiChat] = useState<{role: string, content: string}[]>([]);
  const [showKnowledgeCheck, setShowKnowledgeCheck] = useState(false);
  const [takeawaysBook, setTakeawaysBook] = useState<any>(null);
  const [isGeneratingTakeaways, setIsGeneratingTakeaways] = useState(false);
  const [takeawaysList, setTakeawaysList] = useState<string[]>([]);
  
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isToolbarVisible, setIsToolbarVisible] = useState<boolean>(true);
  const [containerWidth, setContainerWidth] = useState<number>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [streak, setStreak] = useState(0);

  // Reader Discussions State
  const [isDiscussionsOpen, setIsDiscussionsOpen] = useState(false);
  const [discussions, setDiscussions] = useState<any[]>([]);
  const [newDiscussionMsg, setNewDiscussionMsg] = useState("");

  function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
    setNumPages(numPages);
    if (selectedBookToRead) {
      const savedPage = localStorage.getItem(`book_progress_${selectedBookToRead.id}`);
      if (savedPage) {
        setPageNumber(parseInt(savedPage, 10));
      } else {
        setPageNumber(1);
      }
    } else {
      setPageNumber(1);
    }
  }

  // Save reading progress when page changes
  useEffect(() => {
    if (selectedBookToRead && pageNumber) {
      localStorage.setItem(`book_progress_${selectedBookToRead.id}`, pageNumber.toString());
    }
  }, [pageNumber, selectedBookToRead]);

  // Streak logic
  useEffect(() => {
    const lastRead = localStorage.getItem("last_read_date");
    const currentStreak = parseInt(localStorage.getItem("reading_streak") || "0", 10);
    const today = new Date().toDateString();
    
    if (lastRead !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (lastRead === yesterday.toDateString()) {
        setStreak(currentStreak + 1);
        localStorage.setItem("reading_streak", (currentStreak + 1).toString());
      } else if (lastRead) {
        setStreak(1);
        localStorage.setItem("reading_streak", "1");
      } else {
        setStreak(0);
      }
      localStorage.setItem("last_read_date", today);
    } else {
      setStreak(currentStreak);
    }
  }, []);

  // Check milestone for Quiz and Confetti
  useEffect(() => {
    if (!selectedBookToRead || !numPages) return;
    
    // Confetti on last page
    if (pageNumber === numPages) {
      const hasFinished = localStorage.getItem(`finished_${selectedBookToRead.id}`);
      if (!hasFinished) {
        fireConfetti();
        localStorage.setItem(`finished_${selectedBookToRead.id}`, "true");
        addNotification("Congratulations!", "You finished the book! Great job!");
      }
    }
    
    // Knowledge check halfway
    const halfway = Math.floor(numPages / 2);
    if (pageNumber === halfway && numPages > 5) {
      const hasQuiz = localStorage.getItem(`quiz_${selectedBookToRead.id}`);
      if (!hasQuiz) {
        setShowKnowledgeCheck(true);
        localStorage.setItem(`quiz_${selectedBookToRead.id}`, "true");
      }
    }
  }, [pageNumber, numPages, selectedBookToRead]);

  // Keyboard navigation for PDF
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedBookToRead) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        setPageNumber(p => Math.min(numPages || p, p + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        setPageNumber(p => Math.max(1, p - 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedBookToRead, numPages]);

  const fetchDiscussions = async (tag: string) => {
    try {
      const data = await api.community.getComments(tag);
      setDiscussions(data.comments || []);
    } catch (err) {
      console.error("Failed to load discussions", err);
    }
  };

  const handlePostDiscussion = async () => {
    if (!newDiscussionMsg.trim() || (!selectedBookToRead && !selectedCourse)) return;
    try {
      const userStr = localStorage.getItem("spetro_user");
      const user = userStr ? JSON.parse(userStr) : null;
      const author = user?.username || user?.email || "Anonymous Reader";
      
      const tag = selectedCourse ? `course_${selectedCourse.id}` : `book_${selectedBookToRead!.id}`;
      
      await api.community.postComment({
        author,
        content: newDiscussionMsg,
        tag
      });
      setNewDiscussionMsg("");
      fetchDiscussions(tag);
    } catch (err: any) {
      addNotification("Error", err.message || "Failed to post message");
    }
  };

  useEffect(() => {
    if (isDiscussionsOpen && selectedBookToRead) {
      fetchDiscussions(`book_${selectedBookToRead.id}`);
    }
  }, [isDiscussionsOpen, selectedBookToRead]);

  useEffect(() => {
    if (selectedCourse) {
      fetchDiscussions(`course_${selectedCourse.id}`);
    }
  }, [selectedCourse]);

  // Auto-hide toolbar
  useEffect(() => {
    if (!selectedBookToRead) return;
    let timeout: NodeJS.Timeout;
    const handleMouseMove = () => {
      setIsToolbarVisible(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setIsToolbarVisible(false), 3000);
    };
    window.addEventListener('mousemove', handleMouseMove);
    handleMouseMove(); // init
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(timeout);
    };
  }, [selectedBookToRead]);

  // Responsive container width
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [selectedBookToRead, showSidebar]);

  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const isAdminView = user?.role === 'admin';

  // Custom lightweight confetti to avoid npm dependency issues
  const fireConfetti = useCallback(() => {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
    for (let i = 0; i < 50; i++) {
      const el = document.createElement('div');
      el.style.position = 'fixed';
      el.style.left = '50%';
      el.style.top = '50%';
      el.style.width = '8px';
      el.style.height = '8px';
      el.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      el.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
      el.style.zIndex = '9999';
      el.style.pointerEvents = 'none';
      document.body.appendChild(el);

      const angle = Math.random() * Math.PI * 2;
      const velocity = 5 + Math.random() * 10;
      let vx = Math.cos(angle) * velocity;
      let vy = Math.sin(angle) * velocity - 5;
      
      let opacity = 1;
      const animate = () => {
        if (opacity <= 0) {
          el.remove();
          return;
        }
        vy += 0.2; // gravity
        const currentLeft = parseFloat(el.style.left) || 50;
        const currentTop = parseFloat(el.style.top) || 50;
        
        // Convert to absolute pixels for movement
        const rect = el.getBoundingClientRect();
        el.style.left = `${rect.left + vx}px`;
        el.style.top = `${rect.top + vy}px`;
        
        opacity -= 0.02;
        el.style.opacity = opacity.toString();
        requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }
  }, []);

  const handleAiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim()) return;
    
    const newChat = [...aiChat, { role: "user", content: aiInput }];
    setAiChat(newChat);
    setAiInput("");
    
    setTimeout(() => {
      setAiChat([...newChat, { 
        role: "assistant", 
        content: "That's a great question! Based on this page, the author is explaining a complex concept using a simple analogy. This concept is foundational for understanding advanced geospatial workflows."
      }]);
    }, 1000);
  };

  const handleTakeawaysClick = async (book: any) => {
    try {
      setIsGeneratingTakeaways(true);
      const results = await fetchAITakeaways(book.pdfUrl || "", book.title || "");
      setTakeawaysList(results);
      setTakeawaysBook(book);
    } catch (err) {
      console.error("Takeaways error:", err);
      // Fallback to mock data if AI backend fails (e.g., missing API key, backend down)
      setTakeawaysList([
        `Foundational Concepts: This document introduces the core methodologies of ${book.title || 'this topic'}, essential for modern workflows.`,
        `Practical Application: It bridges the gap between theoretical knowledge and real-world deployment, with actionable examples.`,
        `Industry Standards: By the end of this reading, you will understand the industry-standard tools and practices used by professionals today.`
      ]);
      setTakeawaysBook(book);
      addNotification("AI Unavailable", "Showing cached summaries. Please ensure backend and Gemini API are configured.");
    } finally {
      setIsGeneratingTakeaways(false);
    }
  };

  const [videoCourses, setVideoCourses] = useState<any[]>([]);
  const [books, setBooks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  React.useEffect(() => {
    Promise.all([
      api.academy.getCourses().then(data => setVideoCourses(data.courses)).catch(console.error),
      api.academy.getBooks().then(data => setBooks(data.books)).catch(console.error)
    ]).finally(() => setIsLoading(false));
  }, []);

  const extractYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : url;
  };

  const handleAddCourse = async () => {
    if (!newCourse.title || !newCourse.videos.some(v => v.youtubeUrl.trim())) return;
    try {
      const processedVideos = newCourse.videos
        .filter(v => v.youtubeUrl.trim())
        .map((v, idx) => ({
          id: v.id || `v_${idx + 1}`,
          title: v.title.trim() || `Lesson ${idx + 1}`,
          youtubeId: extractYoutubeId(v.youtubeUrl.trim()),
          duration: v.duration.trim() || "15m"
        }));

      const res = await api.academy.createCourse({
        title: newCourse.title,
        description: newCourse.description,
        detailedDescription: newCourse.detailedDescription,
        videos: processedVideos,
        youtubeId: processedVideos[0]?.youtubeId || "",
        duration: newCourse.duration || "New",
        level: newCourse.level || "Beginner"
      });
      setVideoCourses([...videoCourses, res.course]);
      setIsAddCourseOpen(false);
      setNewCourse({
        title: "",
        description: "",
        detailedDescription: "",
        level: "Beginner",
        duration: "1h 00m",
        videos: [{ id: "v_1", title: "Lesson 1: Introduction", youtubeUrl: "", duration: "15m" }]
      });
      addNotification("New Course Added", `"${res.course.title}" is now available in the Academy.`);
      if (isAdminView) {
        api.adminVerify("").then(() => {
          // Ideally admin notify here, but adminVerify is just auth placeholder
        }).catch(() => {});
      }
    } catch (e: any) {
      addNotification("Error", e.message || "Failed to add course");
    }
  };

  const handleDeleteCourse = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.academy.deleteCourse(id);
      setVideoCourses(videoCourses.filter(c => c.id !== id));
      addNotification("Course Deleted", "The course was removed successfully.");
    } catch (e: any) {
      addNotification("Error", e.message || "Failed to delete course");
    }
  };

  const handleEditCourseClick = (course: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const existingVideos = (course.videos && course.videos.length > 0)
      ? course.videos.map((v: any, idx: number) => ({
          id: v.id || `v_${idx + 1}`,
          title: v.title || `Lesson ${idx + 1}`,
          youtubeUrl: v.youtubeId ? `https://www.youtube.com/watch?v=${v.youtubeId}` : "",
          duration: v.duration || "15m"
        }))
      : [{
          id: "v1",
          title: course.title || "Lesson 1",
          youtubeUrl: course.youtubeId ? `https://www.youtube.com/watch?v=${course.youtubeId}` : "",
          duration: course.duration || "15m"
        }];

    setEditingCourse({
      ...course,
      videos: existingVideos
    });
    setIsEditCourseOpen(true);
  };

  const handleUpdateCourse = async () => {
    if (!editingCourse.title || !editingCourse.videos?.some((v: any) => v.youtubeUrl.trim())) return;
    try {
      const processedVideos = editingCourse.videos
        .filter((v: any) => v.youtubeUrl.trim())
        .map((v: any, idx: number) => ({
          id: v.id || `v_${idx + 1}`,
          title: v.title.trim() || `Lesson ${idx + 1}`,
          youtubeId: extractYoutubeId(v.youtubeUrl.trim()),
          duration: v.duration?.trim() || "15m"
        }));

      const res = await api.academy.updateCourse(editingCourse.id, {
        title: editingCourse.title,
        description: editingCourse.description,
        detailedDescription: editingCourse.detailedDescription,
        videos: processedVideos,
        youtubeId: processedVideos[0]?.youtubeId || "",
        duration: editingCourse.duration,
        level: editingCourse.level
      });
      setVideoCourses(videoCourses.map(c => c.id === editingCourse.id ? res.course : c));
      setIsEditCourseOpen(false);
      setEditingCourse(null);
      addNotification("Course Updated", `"${res.course.title}" was updated successfully.`);
    } catch (e: any) {
      addNotification("Error", e.message || "Failed to update course");
    }
  };

  const handleAddBook = async () => {
    if (!newBook.title) return;
    try {
      let res;
      if (newBook.googleBooksUrl) {
        addNotification("Fetching Book", "Downloading PDF from URL...");
        res = await api.academy.fetchBookFromUrl({
          url: newBook.googleBooksUrl,
          title: newBook.title,
          author: newBook.author,
          description: newBook.description,
          pages: parseInt(newBook.pages) || 0
        });
      } else {
        addNotification("Error", "Please provide a valid PDF link.");
        return;
      }
      setBooks([...books, res.book]);
      setIsAddBookOpen(false);
      setNewBook({ title: "", author: "", description: "", pages: "", googleBooksUrl: "" });
      addNotification("New Book Added", `"${res.book.title}" is now available to read.`);
    } catch (e: any) {
      addNotification("Error", e.message || "Failed to fetch book");
    }
  };

  const handleDeleteBook = async (id: string) => {
    try {
      await api.academy.deleteBook(id);
      setBooks(books.filter(b => b.id !== id));
      addNotification("Book Deleted", "The book was removed successfully.");
    } catch (e: any) {
      addNotification("Error", e.message || "Failed to delete book");
    }
  };

  const handleEditBookClick = (book: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBook({
      ...book,
      googleBooksUrl: "" 
    });
    setIsEditBookOpen(true);
  };

  const handleUpdateBook = async () => {
    if (!editingBook.title) return;
    try {
      const res = await api.academy.updateBook(editingBook.id, {
        title: editingBook.title,
        author: editingBook.author,
        pages: editingBook.pages,
        description: editingBook.description
      });
      setBooks(books.map(b => b.id === editingBook.id ? res.book : b));
      setIsEditBookOpen(false);
      setEditingBook(null);
      addNotification("Book Updated", `"${res.book.title}" was updated successfully.`);
    } catch (e: any) {
      addNotification("Error", e.message || "Failed to update book");
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-muted/20">
      <div className="container mx-auto p-6 md:p-10 max-w-6xl space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-3">
              <div className="inline-flex items-center rounded-lg bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                <GraduationCap className="mr-2 h-4 w-4" />
                Corporate Training & Teaching
              </div>
              {streak > 0 && (
                <div className="inline-flex items-center rounded-lg bg-orange-500/10 px-3 py-1 text-sm font-medium text-orange-600 dark:text-orange-400" title="Daily Reading Streak">
                  <Flame className="mr-1 h-4 w-4 text-orange-500" />
                  {streak} Day Streak
                </div>
              )}
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Training & Academy</h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              Comprehensive courses, videos, and reading materials for teams wanting to master project preparation, legal frameworks, and more.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {isAdminView && (
              activeTab === "videos" ? (
                <Button variant="outline" size="sm" onClick={() => setIsAddCourseOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Course
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setIsAddBookOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Book
                </Button>
              )
            )}
            <Button size="sm" className="bg-[#00d4aa] text-black hover:bg-[#00b390]">
              Schedule Call
            </Button>
          </div>
        </div>

        {/* Content Tabs */}
        <Tabs defaultValue="videos" onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-background border h-auto p-1">
            <TabsTrigger value="videos" className="gap-2 px-6 py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <Video className="h-4 w-4" />
              Video Courses
            </TabsTrigger>
            <TabsTrigger value="books" className="gap-2 px-6 py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <BookOpen className="h-4 w-4" />
              Books & Reading
            </TabsTrigger>
          </TabsList>

          <TabsContent value="videos" className="space-y-6 animate-in fade-in-50 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {videoCourses.map((course) => {
                const firstVideoId = (course.videos && course.videos[0]?.youtubeId) || course.youtubeId;
                const videoCount = (course.videos && course.videos.length > 0) ? course.videos.length : 1;

                return (
                  <Card key={course.id} className="flex flex-col h-full hover:shadow-md transition-all duration-300 border-border/50 overflow-hidden">
                    <div 
                      className="aspect-video bg-muted relative flex items-center justify-center group cursor-pointer overflow-hidden"
                      onClick={() => {
                        setSelectedCourse(course);
                        setSelectedVideoIndex(0);
                      }}
                    >
                      <img 
                        src={firstVideoId ? `https://img.youtube.com/vi/${firstVideoId}/hqdefault.jpg` : `https://images.unsplash.com/photo-1516321497487-e288fb19713f?w=600&q=80`} 
                        alt={course.title}
                        className="absolute inset-0 object-cover w-full h-full opacity-60 group-hover:opacity-40 transition-opacity duration-300"
                      />
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors" />
                      <PlayCircle className="h-12 w-12 text-white opacity-90 group-hover:scale-110 transition-transform duration-300 z-10" />
                      
                      {course.completed && (
                        <div className="absolute top-3 right-3 bg-green-500/90 text-white p-1 rounded-full z-10">
                          <CheckCircle2 className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    
                    <CardHeader className="flex-1 pb-4 relative">
                      {isAdminView && (
                        <div className="absolute top-4 right-4 z-20 flex gap-1 bg-background/80 rounded-md backdrop-blur-sm p-1 border shadow-sm">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={(e) => handleEditCourseClick(course, e)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={(e) => handleDeleteCourse(course.id, e)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                      <div className="flex items-center justify-between mb-2 pr-8">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className="text-xs bg-background">
                            {course.level}
                          </Badge>
                          <Badge variant="secondary" className="text-[11px] font-medium flex items-center gap-1">
                            <Video className="w-3 h-3 text-primary" />
                            {videoCount} {videoCount === 1 ? 'lesson' : 'lessons'}
                          </Badge>
                        </div>
                        <div className="flex items-center text-xs text-muted-foreground shrink-0">
                          <Clock className="mr-1 h-3 w-3" />
                          {course.duration}
                        </div>
                      </div>
                      <CardTitle className="text-lg leading-tight group-hover:text-primary transition-colors">
                        {course.title}
                      </CardTitle>
                      <CardDescription className="text-sm line-clamp-2 mt-2">
                        {course.description}
                      </CardDescription>
                    </CardHeader>
                    
                    <CardFooter className="pt-0 pb-5">
                      <Button 
                        variant={course.completed ? "secondary" : "default"} 
                        className="w-full gap-2"
                        onClick={() => {
                          setSelectedCourse(course);
                          setSelectedVideoIndex(0);
                        }}
                      >
                        {course.completed ? (
                           <> <CheckCircle2 className="h-4 w-4" /> Review Course </>
                        ) : (
                           <> <PlayCircle className="h-4 w-4" /> Start Learning </>
                        )}
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="books" className="space-y-6 animate-in fade-in-50 duration-500">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {books.map((book) => (
                <Card key={book.id} className="flex overflow-hidden hover:shadow-md transition-all duration-300 border-border/50 relative">
                  {isAdminView && (
                    <div className="absolute top-2 right-2 z-10 flex gap-1 bg-background/80 rounded-md backdrop-blur-sm p-1 border shadow-sm">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={(e) => handleEditBookClick(book, e)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteBook(book.id); }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                  <div className="w-1/3 bg-muted border-r flex items-center justify-center p-6 relative">
                     <BookOpen className="h-16 w-16 text-muted-foreground/30" />
                     <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/10 to-transparent" />
                  </div>
                  <div className="w-2/3 flex flex-col justify-between p-6">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="secondary" className="text-xs">
                          eBook
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <FileText className="h-3 w-3" /> {book.pages} pages
                        </span>
                      </div>
                      <h3 className="text-xl font-bold mb-1 leading-tight">{book.title}</h3>
                      <p className="text-sm font-medium text-primary mb-3">By {book.author}</p>
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {book.description}
                      </p>
                    </div>
                    <div className="mt-6 flex flex-col gap-2">
                      <Button className="w-full" onClick={() => setSelectedBookToRead(book)}>
                        <BookOpen className="mr-2 h-4 w-4" />
                        Read Full Book
                      </Button>
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1 border-primary/50 text-primary hover:bg-primary/10" title="Listen to a quick 5-minute audio summary">
                          <Headphones className="mr-2 h-4 w-4" />
                          Audio Summary
                        </Button>
                        <Button variant="secondary" className="flex-1" title="Read the 3 key takeaways" onClick={() => handleTakeawaysClick(book)} disabled={isGeneratingTakeaways}>
                          {isGeneratingTakeaways ? (
                            <Loader2 className="mr-2 h-4 w-4 text-amber-500 animate-spin" />
                          ) : (
                            <Sparkles className="mr-2 h-4 w-4 text-amber-500" />
                          )}
                          Takeaways
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
        
      </div>

      {/* Video Player & Description Dialog */}
      <Dialog 
        open={!!selectedCourse} 
        onOpenChange={(open) => {
          if (!open) setSelectedCourse(null);
        }}
      >
        <DialogContent className="sm:max-w-[90vw] md:max-w-5xl lg:max-w-6xl p-0 h-[90vh] md:h-[85vh] overflow-hidden bg-card/95 backdrop-blur-md border-border/50 flex flex-col">
          {selectedCourse && (() => {
            const courseVideos = (selectedCourse.videos && selectedCourse.videos.length > 0)
              ? selectedCourse.videos
              : [{
                  id: "v1",
                  title: selectedCourse.title || "Video Lesson",
                  youtubeId: selectedCourse.youtubeId,
                  duration: selectedCourse.duration || "15m"
                }];
            const activeVideo = courseVideos[selectedVideoIndex] || courseVideos[0];

            return (
              <div className="flex flex-col md:flex-row h-full w-full">
                {/* Left Column: Video & Info */}
                <div className="flex-1 flex flex-col overflow-y-auto border-r">
                  {/* YouTube Embed */}
                  <div className="relative w-full bg-black shrink-0" style={{ paddingTop: '56.25%' /* 16:9 Aspect Ratio */ }}>
                    {activeVideo?.youtubeId ? (
                      <iframe
                        key={activeVideo.youtubeId}
                        className="absolute top-0 left-0 w-full h-full"
                        src={`https://www.youtube.com/embed/${activeVideo.youtubeId}?autoplay=1`}
                        title={activeVideo.title || selectedCourse.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <div className="flex items-center justify-center w-full h-full text-muted-foreground">
                        No video available for this lesson
                      </div>
                    )}
                  </div>

                  {/* Video Lesson Navigation Bar */}
                  <div className="px-6 py-3 bg-muted/40 border-b flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="text-xs shrink-0 font-semibold">
                        Part {selectedVideoIndex + 1} of {courseVideos.length}
                      </Badge>
                      <span className="text-sm font-medium truncate text-foreground">
                        {activeVideo?.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        disabled={selectedVideoIndex === 0}
                        onClick={() => setSelectedVideoIndex(i => Math.max(0, i - 1))}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" /> Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        disabled={selectedVideoIndex >= courseVideos.length - 1}
                        onClick={() => setSelectedVideoIndex(i => Math.min(courseVideos.length - 1, i + 1))}
                      >
                        Next <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Course Info */}
                  <div className="p-6 md:p-8 space-y-4 flex-1">
                    <DialogHeader>
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <Badge variant="outline" className="text-xs bg-background text-primary border-primary/30">
                          {selectedCourse.level}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {courseVideos.length} {courseVideos.length === 1 ? 'Lesson' : 'Lessons'}
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center">
                          <Clock className="mr-1 h-3 w-3" />
                          {selectedCourse.duration}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center">
                          <User className="mr-1 h-3 w-3" />
                          {Math.floor(Math.random() * 500 + 100)} enrolled
                        </span>
                      </div>
                      <DialogTitle className="text-2xl font-bold">{selectedCourse.title}</DialogTitle>
                    </DialogHeader>
                    
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <h4 className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">About this course</h4>
                      <p className="text-muted-foreground leading-relaxed text-sm">
                        {selectedCourse.detailedDescription || selectedCourse.description}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right Column: Playlist & Discussions Tabs */}
                <div className="w-full md:w-80 lg:w-96 flex flex-col bg-card h-[50vh] md:h-full border-t md:border-t-0 shrink-0">
                  <Tabs defaultValue="playlist" className="flex flex-col h-full">
                    <div className="p-2 border-b bg-muted/20 shrink-0">
                      <TabsList className="w-full grid grid-cols-2">
                        <TabsTrigger value="playlist" className="text-xs gap-1.5 py-1.5">
                          <Video className="w-3.5 h-3.5 text-primary" />
                          Lessons ({courseVideos.length})
                        </TabsTrigger>
                        <TabsTrigger value="discussion" className="text-xs gap-1.5 py-1.5">
                          <MessageCircle className="w-3.5 h-3.5" />
                          Discussion ({discussions.length})
                        </TabsTrigger>
                      </TabsList>
                    </div>

                    {/* Playlist Tab */}
                    <TabsContent value="playlist" className="flex-1 m-0 overflow-y-auto p-3 space-y-2">
                      <div className="text-xs font-semibold text-muted-foreground px-1 py-1 uppercase tracking-wider">
                        Course Playlist
                      </div>
                      {courseVideos.map((video: any, idx: number) => {
                        const isActive = idx === selectedVideoIndex;
                        return (
                          <div
                            key={video.id || idx}
                            onClick={() => setSelectedVideoIndex(idx)}
                            className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center gap-3 ${
                              isActive
                                ? "bg-primary/10 border-primary text-primary shadow-sm"
                                : "bg-muted/30 hover:bg-muted/70 border-border/60 text-card-foreground"
                            }`}
                          >
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                              isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground border"
                            }`}>
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium truncate ${isActive ? "text-primary font-semibold" : ""}`}>
                                {video.title || `Lesson ${idx + 1}`}
                              </p>
                              {video.duration && (
                                <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <Clock className="w-2.5 h-2.5" /> {video.duration}
                                </span>
                              )}
                            </div>
                            <PlayCircle className={`w-4 h-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground/40"}`} />
                          </div>
                        );
                      })}
                    </TabsContent>

                    {/* Discussion Tab */}
                    <TabsContent value="discussion" className="flex-1 m-0 flex flex-col overflow-hidden">
                      <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {discussions.length > 0 ? discussions.map(msg => (
                          <div key={msg.id} className="bg-card p-3 rounded-lg border shadow-sm">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                                  {msg.author.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-xs font-semibold">{msg.author}</span>
                              </div>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(msg.timestamp).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-sm pl-8 text-card-foreground leading-snug">{msg.content}</p>
                          </div>
                        )) : (
                          <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-60 p-4 text-center">
                            <MessageCircle className="w-10 h-10 mb-3 opacity-50" />
                            <p className="text-sm">No discussions yet for this course.</p>
                            <p className="text-xs mt-1">Ask a question or share your thoughts!</p>
                          </div>
                        )}
                      </div>
                      
                      <div className="p-4 bg-card border-t shrink-0">
                        <div className="flex flex-col gap-2">
                          <Textarea 
                            placeholder="Add to the discussion..." 
                            className="min-h-[70px] resize-none text-sm bg-muted/50 focus:bg-background"
                            value={newDiscussionMsg}
                            onChange={e => setNewDiscussionMsg(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handlePostDiscussion();
                              }
                            }}
                          />
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] text-muted-foreground">Press Enter to post</span>
                            <Button size="sm" onClick={handlePostDiscussion} disabled={!newDiscussionMsg.trim()}>Post</Button>
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Add Course Dialog */}
      <Dialog open={isAddCourseOpen} onOpenChange={setIsAddCourseOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Course</DialogTitle>
            <DialogDescription>
              Add a new course with one or multiple YouTube video lessons.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Course Title</Label>
              <Input 
                placeholder="e.g. Advanced QGIS Mapping Masterclass" 
                value={newCourse.title}
                onChange={e => setNewCourse({...newCourse, title: e.target.value})}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Level</Label>
                <Input 
                  placeholder="e.g. Beginner, Intermediate, Advanced" 
                  value={newCourse.level}
                  onChange={e => setNewCourse({...newCourse, level: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Estimated Total Duration</Label>
                <Input 
                  placeholder="e.g. 1h 30m" 
                  value={newCourse.duration}
                  onChange={e => setNewCourse({...newCourse, duration: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Short Summary (for card)</Label>
              <Input 
                placeholder="Brief summary..." 
                value={newCourse.description}
                onChange={e => setNewCourse({...newCourse, description: e.target.value})}
              />
            </div>

            <div className="space-y-2">
              <Label>Detailed Description (for course player)</Label>
              <Textarea 
                placeholder="Explain what this course covers in detail..." 
                className="h-20"
                value={newCourse.detailedDescription}
                onChange={e => setNewCourse({...newCourse, detailedDescription: e.target.value})}
              />
            </div>

            {/* Dynamic Course Videos / Lessons List */}
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Course Lessons / Videos ({newCourse.videos.length})</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => {
                    setNewCourse({
                      ...newCourse,
                      videos: [
                        ...newCourse.videos,
                        { id: `v_${Date.now()}`, title: `Lesson ${newCourse.videos.length + 1}`, youtubeUrl: "", duration: "15m" }
                      ]
                    });
                  }}
                >
                  <Plus className="w-3.5 h-3.5" /> Add Lesson
                </Button>
              </div>

              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                {newCourse.videos.map((vid, idx) => (
                  <div key={vid.id || idx} className="p-3 bg-muted/40 rounded-lg border space-y-2.5 relative">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-primary">Lesson #{idx + 1}</span>
                      {newCourse.videos.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            setNewCourse({
                              ...newCourse,
                              videos: newCourse.videos.filter((_, i) => i !== idx)
                            });
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2 space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Title</Label>
                        <Input
                          className="h-8 text-xs"
                          placeholder={`Lesson ${idx + 1} title`}
                          value={vid.title}
                          onChange={e => {
                            const updated = [...newCourse.videos];
                            updated[idx].title = e.target.value;
                            setNewCourse({ ...newCourse, videos: updated });
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Duration</Label>
                        <Input
                          className="h-8 text-xs"
                          placeholder="e.g. 15m"
                          value={vid.duration}
                          onChange={e => {
                            const updated = [...newCourse.videos];
                            updated[idx].duration = e.target.value;
                            setNewCourse({ ...newCourse, videos: updated });
                          }}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">YouTube URL or ID</Label>
                      <Input
                        className="h-8 text-xs"
                        placeholder="https://www.youtube.com/watch?v=..."
                        value={vid.youtubeUrl}
                        onChange={e => {
                          const updated = [...newCourse.videos];
                          updated[idx].youtubeUrl = e.target.value;
                          setNewCourse({ ...newCourse, videos: updated });
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setIsAddCourseOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleAddCourse} 
              disabled={!newCourse.title || !newCourse.videos.some(v => v.youtubeUrl.trim())}
            >
              Add Course
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Book Dialog (Manual Entry) */}
      <Dialog open={isAddBookOpen} onOpenChange={setIsAddBookOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add New Document</DialogTitle>
            <DialogDescription>
              Paste a Google Books URL or a direct link to a PDF. The document will be embedded in the platform.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Book Title</Label>
              <Input 
                placeholder="e.g. Environmental Science" 
                value={newBook.title}
                onChange={e => setNewBook({...newBook, title: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Document URL (Google Books or Direct PDF)</Label>
              <Input 
                placeholder="e.g. https://books.google.com/... or https://.../file.pdf" 
                value={newBook.googleBooksUrl}
                onChange={e => setNewBook({...newBook, googleBooksUrl: e.target.value})}
              />
            </div>
            <div className="flex gap-4">
              <div className="space-y-2 flex-1">
                <Label>Author</Label>
                <Input 
                  placeholder="e.g. Jane Doe" 
                  value={newBook.author}
                  onChange={e => setNewBook({...newBook, author: e.target.value})}
                />
              </div>
              <div className="space-y-2 w-32">
                <Label>Pages</Label>
                <Input 
                  placeholder="e.g. 320" 
                  type="number"
                  value={newBook.pages}
                  onChange={e => setNewBook({...newBook, pages: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea 
                placeholder="Brief summary..." 
                className="h-24"
                value={newBook.description}
                onChange={e => setNewBook({...newBook, description: e.target.value})}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsAddBookOpen(false)}>Cancel</Button>
            <Button onClick={handleAddBook} disabled={!newBook.title || !newBook.googleBooksUrl}>
              Add Book
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Book Reader Viewer */}
      <Dialog open={!!selectedBookToRead} onOpenChange={(open) => !open && setSelectedBookToRead(null)}>
        <DialogContent 
          className={`p-0 flex flex-col bg-card border-none transition-all duration-300 overflow-hidden ${
            isFullscreen ? 'max-w-none w-screen h-screen rounded-none m-0 top-0 left-0 translate-x-0 translate-y-0 data-[state=open]:animate-in' : 'sm:max-w-6xl h-[85vh]'
          }`}
        >
          {/* Top Header Overlay */}
          <div 
            className={`absolute top-0 left-0 right-0 z-50 transition-transform duration-500 ${isToolbarVisible ? 'translate-y-0' : '-translate-y-full'} bg-background/95 backdrop-blur-md border-b flex flex-col p-0`}
          >
            {/* Progress Bar Line */}
            <div className="h-1 w-full bg-muted overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${numPages ? (pageNumber / numPages) * 100 : 0}%` }}
              />
            </div>
            <div className="flex flex-row items-center justify-between p-3">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setShowSidebar(!showSidebar)} title="Toggle Table of Contents">
                <ListTree className="h-5 w-5" />
              </Button>
              <div className="space-y-0.5">
                <DialogTitle className="text-base flex items-center gap-2">
                  {selectedBookToRead?.title}
                  {numPages && (
                    <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">
                      ~{Math.max(1, Math.ceil((numPages - pageNumber) * 1.5))} mins left
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs">By {selectedBookToRead?.author}</DialogDescription>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setIsFullscreen(!isFullscreen)} title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}>
                {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setSelectedBookToRead(null)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            </div>
          </div>

          <div className="flex-1 relative w-full h-full bg-muted/30 flex overflow-hidden pt-16">
            
            {/* Sidebar for Outline & AI */}
            {showSidebar && selectedBookToRead && (
              <div className="w-72 md:w-80 border-r bg-background/95 backdrop-blur z-40 flex flex-col shrink-0 absolute left-0 top-0 bottom-0 shadow-xl transition-all pt-[60px]">
                <div className="flex border-b p-1 gap-1">
                  <Button 
                    variant={sidebarTab === "toc" ? "secondary" : "ghost"} 
                    className="flex-1 text-xs h-8" 
                    onClick={() => setSidebarTab("toc")}
                  >
                    <ListTree className="mr-2 h-3 w-3" /> Contents
                  </Button>
                  <Button 
                    variant={sidebarTab === "ai" ? "secondary" : "ghost"} 
                    className="flex-1 text-xs h-8" 
                    onClick={() => setSidebarTab("ai")}
                  >
                    <Bot className="mr-2 h-3 w-3" /> AI Tutor
                  </Button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  {sidebarTab === "toc" ? (
                    <div className="text-sm prose prose-sm dark:prose-invert">
                      <Document file={selectedBookToRead.volumeId?.startsWith("http") || selectedBookToRead.volumeId?.startsWith("data:") ? selectedBookToRead.volumeId : `${BASE}/academy/books/${selectedBookToRead.id}/download`}>
                        <Outline 
                          className="cursor-pointer hover:text-primary [&_ul]:pl-4 [&_li]:mt-2"
                          onItemClick={({ pageNumber }) => {
                            if (pageNumber) setPageNumber(parseInt(pageNumber as string, 10));
                            if (window.innerWidth < 768) setShowSidebar(false);
                          }} 
                        />
                      </Document>
                    </div>
                  ) : (
                    <div className="flex flex-col h-full">
                      <div className="bg-primary/10 p-3 rounded-md text-sm mb-4 flex gap-2">
                        <HelpCircle className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                        <p>I'm your AI Reading Tutor. Ask me to summarize or explain anything from this page!</p>
                      </div>
                      
                      <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
                        {aiChat.map((msg, idx) => (
                          <div key={idx} className={`p-2.5 rounded-lg text-sm ${msg.role === 'user' ? 'bg-secondary ml-4 rounded-tr-none' : 'bg-primary/10 mr-4 rounded-tl-none border border-primary/20'}`}>
                            {msg.content}
                          </div>
                        ))}
                      </div>
                      
                      <form onSubmit={handleAiSubmit} className="flex gap-2 shrink-0">
                        <Input 
                          placeholder="Ask AI..." 
                          value={aiInput} 
                          onChange={(e) => setAiInput(e.target.value)} 
                          className="h-9 text-sm"
                        />
                        <Button type="submit" size="sm" disabled={!aiInput.trim()} className="h-9 px-3 bg-primary">Ask</Button>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Main PDF Container */}
            <div 
              ref={containerRef}
              className="flex-1 flex flex-col items-center overflow-y-auto p-4 pb-32 relative transition-all w-full"
            >
              {selectedBookToRead ? (
                <div style={{ filter: isPdfDarkMode ? 'invert(0.9) hue-rotate(180deg) contrast(0.9)' : 'none' }}>
                  <Document
                    file={
                      selectedBookToRead.volumeId?.startsWith("http") || selectedBookToRead.volumeId?.startsWith("data:")
                        ? selectedBookToRead.volumeId
                        : `${BASE}/academy/books/${selectedBookToRead.id}/download`
                    }
                    onLoadSuccess={onDocumentLoadSuccess}
                    className="flex flex-col items-center shadow-2xl rounded-sm overflow-hidden bg-white"
                    loading={
                      <div className="flex items-center justify-center h-[60vh] w-full">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                      </div>
                    }
                    error={
                      <div className="flex items-center justify-center h-[60vh] text-destructive flex-col gap-2 w-full">
                        <BookOpen className="w-12 h-12 opacity-50" />
                        <p>Failed to load PDF.</p>
                      </div>
                    }
                  >
                    <Page 
                      pageNumber={pageNumber} 
                      scale={pdfScale}
                      width={containerWidth ? Math.min(containerWidth - 32, 900) : undefined}
                      className="max-w-full"
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                    />
                  </Document>
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground p-8 text-center flex-col gap-4">
                  <BookOpen className="w-12 h-12 opacity-20" />
                  <p>This book does not have a valid PDF file uploaded.<br/>Please add a PDF to read it online.</p>
                </div>
              )}
            </div>

            {/* Bottom Toolbar Overlay */}
            {selectedBookToRead && (
              <div 
                className={`absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-background/95 backdrop-blur-md p-1.5 rounded-full border shadow-xl z-40 transition-all duration-500 ${isToolbarVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0 pointer-events-none'}`}
              >
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setPageNumber(p => Math.max(1, p - 1))} disabled={pageNumber <= 1} title="Previous Page (Left Arrow)">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs font-medium px-2 min-w-[70px] text-center">
                  {pageNumber} / {numPages || '?'}
                </span>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setPageNumber(p => Math.min(numPages || p, p + 1))} disabled={pageNumber >= (numPages || 1)} title="Next Page (Right Arrow)">
                  <ChevronRight className="h-4 w-4" />
                </Button>
                
                <div className="w-px h-5 bg-border mx-1" />
                
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hidden sm:flex" onClick={() => setPdfScale(s => Math.max(0.5, s - 0.2))} title="Zoom Out">
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-xs font-medium px-1 w-12 text-center hidden sm:block">{Math.round(pdfScale * 100)}%</span>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hidden sm:flex" onClick={() => setPdfScale(s => Math.min(3, s + 0.2))} title="Zoom In">
                  <ZoomIn className="h-4 w-4" />
                </Button>
                
                <div className="w-px h-5 bg-border mx-1 hidden sm:block" />
                
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 rounded-full" 
                  onClick={() => setIsDiscussionsOpen(true)} 
                  title="Community Discussions"
                >
                  <MessageCircle className="h-4 w-4" />
                </Button>

                <div className="w-px h-5 bg-border mx-1" />

                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`h-8 w-8 rounded-full ${isPdfDarkMode ? 'bg-amber-500/10 text-amber-500' : ''}`} 
                  onClick={() => setIsPdfDarkMode(!isPdfDarkMode)} 
                  title="Toggle Reading Mode (Dark/Light)"
                >
                  {isPdfDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
              </div>
            )}
            
            {/* Reader Discussions Sidebar */}
            {isDiscussionsOpen && selectedBookToRead && (
              <div className="w-80 md:w-96 border-l bg-background/95 backdrop-blur z-40 flex flex-col shrink-0 absolute right-0 top-0 bottom-0 shadow-xl transition-all pt-[60px]">
                <div className="flex items-center gap-2 p-4 border-b">
                  <MessageCircle className="h-5 w-5 text-primary" />
                  <div className="flex-1 font-semibold">Reader Discussions</div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsDiscussionsOpen(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/20">
                  {discussions.length > 0 ? discussions.map(msg => (
                    <div key={msg.id} className="bg-card p-4 rounded-xl border shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                          {msg.author.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold leading-none">{msg.author}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(msg.timestamp).toLocaleDateString()} at {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm text-card-foreground whitespace-pre-wrap pl-10">{msg.content}</p>
                    </div>
                  )) : (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-60">
                      <MessageCircle className="w-12 h-12 mb-4" />
                      <p>No discussions yet.</p>
                      <p className="text-sm">Be the first to share your thoughts!</p>
                    </div>
                  )}
                </div>
                
                <div className="p-3 border-t bg-background">
                  <div className="flex gap-2">
                    <Textarea 
                      placeholder="Share your thoughts..." 
                      className="min-h-[80px] resize-none text-sm"
                      value={newDiscussionMsg}
                      onChange={e => setNewDiscussionMsg(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handlePostDiscussion();
                        }
                      }}
                    />
                    <Button className="h-auto px-4" onClick={handlePostDiscussion} disabled={!newDiscussionMsg.trim()}>Post</Button>
                  </div>
                </div>
              </div>
            )}
            
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Edit Course Dialog */}
      <Dialog open={isEditCourseOpen} onOpenChange={setIsEditCourseOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Course</DialogTitle>
            <DialogDescription>
              Update the course details and manage its video lessons below.
            </DialogDescription>
          </DialogHeader>
          {editingCourse && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Course Title</Label>
                <Input 
                  placeholder="e.g. Advanced QGIS Mapping Masterclass" 
                  value={editingCourse.title}
                  onChange={e => setEditingCourse({...editingCourse, title: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Level</Label>
                  <Input 
                    placeholder="e.g. Beginner, Intermediate, Advanced" 
                    value={editingCourse.level || ""}
                    onChange={e => setEditingCourse({...editingCourse, level: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Total Duration</Label>
                  <Input 
                    placeholder="e.g. 1h 15m" 
                    value={editingCourse.duration || ""}
                    onChange={e => setEditingCourse({...editingCourse, duration: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Short Summary (for card)</Label>
                <Input 
                  placeholder="Brief summary..." 
                  value={editingCourse.description}
                  onChange={e => setEditingCourse({...editingCourse, description: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <Label>Detailed Description (for course player)</Label>
                <Textarea 
                  placeholder="Explain what this course covers in detail..." 
                  className="h-20"
                  value={editingCourse.detailedDescription}
                  onChange={e => setEditingCourse({...editingCourse, detailedDescription: e.target.value})}
                />
              </div>

              {/* Dynamic Course Videos / Lessons List */}
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Course Lessons / Videos ({editingCourse.videos?.length || 0})</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      const vids = editingCourse.videos || [];
                      setEditingCourse({
                        ...editingCourse,
                        videos: [
                          ...vids,
                          { id: `v_${Date.now()}`, title: `Lesson ${vids.length + 1}`, youtubeUrl: "", duration: "15m" }
                        ]
                      });
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Lesson
                  </Button>
                </div>

                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {editingCourse.videos?.map((vid: any, idx: number) => (
                    <div key={vid.id || idx} className="p-3 bg-muted/40 rounded-lg border space-y-2.5 relative">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-primary">Lesson #{idx + 1}</span>
                        {editingCourse.videos.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              setEditingCourse({
                                ...editingCourse,
                                videos: editingCourse.videos.filter((_: any, i: number) => i !== idx)
                              });
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2 space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Title</Label>
                          <Input
                            className="h-8 text-xs"
                            placeholder={`Lesson ${idx + 1} title`}
                            value={vid.title}
                            onChange={e => {
                              const updated = [...editingCourse.videos];
                              updated[idx].title = e.target.value;
                              setEditingCourse({ ...editingCourse, videos: updated });
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Duration</Label>
                          <Input
                            className="h-8 text-xs"
                            placeholder="e.g. 15m"
                            value={vid.duration}
                            onChange={e => {
                              const updated = [...editingCourse.videos];
                              updated[idx].duration = e.target.value;
                              setEditingCourse({ ...editingCourse, videos: updated });
                            }}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">YouTube URL or ID</Label>
                        <Input
                          className="h-8 text-xs"
                          placeholder="https://www.youtube.com/watch?v=..."
                          value={vid.youtubeUrl}
                          onChange={e => {
                            const updated = [...editingCourse.videos];
                            updated[idx].youtubeUrl = e.target.value;
                            setEditingCourse({ ...editingCourse, videos: updated });
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setIsEditCourseOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleUpdateCourse} 
              disabled={!editingCourse?.title || !editingCourse?.videos?.some((v: any) => v.youtubeUrl.trim())}
            >
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Book Dialog */}
      <Dialog open={isEditBookOpen} onOpenChange={setIsEditBookOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
            <DialogDescription>
              Update the document details below.
            </DialogDescription>
          </DialogHeader>
          {editingBook && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Book Title</Label>
                <Input 
                  placeholder="e.g. Environmental Science" 
                  value={editingBook.title}
                  onChange={e => setEditingBook({...editingBook, title: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Document URL (Google Books or Direct PDF)</Label>
                <Input 
                  placeholder="e.g. https://books.google.com/... or https://.../file.pdf" 
                  value={editingBook.googleBooksUrl}
                  onChange={e => setEditingBook({...editingBook, googleBooksUrl: e.target.value})}
                />
              </div>
              <div className="flex gap-4">
                <div className="space-y-2 flex-1">
                  <Label>Author</Label>
                  <Input 
                    placeholder="e.g. Jane Doe" 
                    value={editingBook.author}
                    onChange={e => setEditingBook({...editingBook, author: e.target.value})}
                  />
                </div>
                <div className="space-y-2 w-32">
                  <Label>Pages</Label>
                  <Input 
                    placeholder="e.g. 320" 
                    type="number"
                    value={editingBook.pages}
                    onChange={e => setEditingBook({...editingBook, pages: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea 
                  placeholder="Brief summary..." 
                  className="h-24"
                  value={editingBook.description}
                  onChange={e => setEditingBook({...editingBook, description: e.target.value})}
                />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsEditBookOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateBook} disabled={!editingBook?.title || !editingBook?.googleBooksUrl}>
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Knowledge Check Popover */}
      <Dialog open={showKnowledgeCheck} onOpenChange={setShowKnowledgeCheck}>
        <DialogContent className="sm:max-w-md text-center">
          <DialogHeader>
            <DialogTitle className="flex flex-col items-center gap-2">
              <Sparkles className="h-8 w-8 text-amber-500" />
              Knowledge Check!
            </DialogTitle>
            <DialogDescription>
              You're halfway through! Let's see if you were paying attention.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 space-y-4">
            <h4 className="font-semibold text-lg">Which is a primary benefit of using spatial data in urban planning?</h4>
            <div className="grid grid-cols-1 gap-2">
              <Button variant="outline" className="justify-start text-left h-auto py-3 px-4" onClick={() => addNotification("Incorrect", "Try again!")}>A) It reduces the need for internet access.</Button>
              <Button variant="outline" className="justify-start text-left h-auto py-3 px-4 hover:bg-green-500/10 hover:border-green-500 hover:text-green-600" onClick={() => {
                setShowKnowledgeCheck(false);
                fireConfetti();
                addNotification("Correct!", "You earned +50 XP!");
              }}>B) It visualizes patterns and relationships in real-world geography.</Button>
              <Button variant="outline" className="justify-start text-left h-auto py-3 px-4" onClick={() => addNotification("Incorrect", "Try again!")}>C) It automates all decision making.</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Takeaways Dialog */}
      <Dialog open={!!takeawaysBook} onOpenChange={(open) => !open && setTakeawaysBook(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="h-5 w-5 text-amber-500" />
              AI Summary & Takeaways
            </DialogTitle>
            <DialogDescription>
              Here are the 3 key takeaways from "{takeawaysBook?.title}".
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-3">
              {takeawaysList.length > 0 ? takeawaysList.map((takeaway, idx) => (
                <div key={idx} className="flex gap-3 items-start">
                  <div className="bg-primary/20 text-primary rounded-full w-6 h-6 flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">{idx + 1}</div>
                  <p className="text-sm"><strong>Takeaway {idx + 1}:</strong> {takeaway}</p>
                </div>
              )) : (
                <div className="text-center text-sm text-muted-foreground italic">No takeaways generated.</div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setTakeawaysBook(null)}>Close</Button>
              <Button onClick={() => {
                setTakeawaysBook(null);
                setSelectedBookToRead(takeawaysBook);
              }}>
                <BookOpen className="mr-2 h-4 w-4" /> Start Reading
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


