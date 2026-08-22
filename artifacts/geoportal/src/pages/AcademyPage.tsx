import React, { useState } from "react";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PlayCircle, BookOpen, Clock, CheckCircle2, GraduationCap, Video, FileText, Plus, Trash2, Headphones, Sparkles, Search, Shield, User, Pencil } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from "@/hooks/use-notifications";
import { api } from "@/lib/api";

export function AcademyPage() {
  const [activeTab, setActiveTab] = useState("videos");
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  
  const [isAddCourseOpen, setIsAddCourseOpen] = useState(false);
  const [newCourse, setNewCourse] = useState({ title: "", description: "", detailedDescription: "", youtubeUrl: "" });

  const [isAddBookOpen, setIsAddBookOpen] = useState(false);
  const [newBook, setNewBook] = useState({ title: "", author: "", description: "", pages: "", googleBooksUrl: "" });
  const [selectedBookToRead, setSelectedBookToRead] = useState<any>(null);

  const [isEditCourseOpen, setIsEditCourseOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<any>(null);

  const [isEditBookOpen, setIsEditBookOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<any>(null);

  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const isAdminView = user?.role === 'admin';

  const [videoCourses, setVideoCourses] = useState([
    {
      id: 1,
      title: "Project Preparation 101",
      description: "Learn how to prepare a project from scratch, define scope, and set realistic milestones.",
      detailedDescription: "In this comprehensive module, we dive deep into the essential first steps of any project. You will learn how to draft a project charter, identify key stakeholders, and define a clear, achievable scope. The video walks through a real-world example of setting up a geospatial project, avoiding common pitfalls, and establishing milestones that keep your team on track.",
      duration: "45 mins",
      modules: 3,
      level: "Beginner",
      completed: false,
      youtubeId: "jNQXAC9IVRw", // Placeholder, replace with actual YouTube ID
    },
    {
      id: 2,
      title: "What to Look for When Undertaking a Project",
      description: "Risk assessment, feasibility studies, and stakeholder alignment best practices.",
      detailedDescription: "Before committing resources, you must evaluate a project's viability. This course covers how to conduct a thorough feasibility study, including technical, economic, and operational assessments. We will also explore risk management frameworks—how to identify potential roadblocks early and create mitigation strategies so your project runs smoothly.",
      duration: "1 hr 15 mins",
      modules: 5,
      level: "Intermediate",
      completed: true,
      youtubeId: "LXb3EKWsInQ", // Placeholder, replace with actual YouTube ID
    },
    {
      id: 3,
      title: "Why You Need to Know the Laws",
      description: "Legal foundations for projects, compliance, and regulatory frameworks.",
      detailedDescription: "Navigating the legal landscape is crucial for any project, especially in data and environmental sectors. This session explains the importance of understanding local and international regulations, data privacy laws (like GDPR), and environmental compliance. You'll learn how non-compliance can derail a project and the steps to ensure all your activities remain legally sound.",
      duration: "2 hrs",
      modules: 8,
      level: "Advanced",
      completed: false,
      youtubeId: "sBws8MSXN7A", // Placeholder, replace with actual YouTube ID
    },
    {
      id: 4,
      title: "Marketing & Advertising Tactics",
      description: "Master modern marketing strategies, digital advertising, and audience targeting.",
      detailedDescription: "In this module, you'll learn the core principles of marketing and advertising tailored for today's digital landscape. We cover campaign planning, SEO/SEM fundamentals, social media advertising, and how to measure ROI effectively. Whether you're launching a new tool or promoting a service, these tactics will help you reach and convert your target audience.",
      duration: "1 hr 30 mins",
      modules: 4,
      level: "Intermediate",
      completed: false,
      youtubeId: "bO1eSvhG9yQ", 
    }
  ]);

  const extractYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : url;
  };

  const handleAddCourse = () => {
    if (!newCourse.title || !newCourse.youtubeUrl) return;
    const newId = videoCourses.length ? Math.max(...videoCourses.map(c => c.id)) + 1 : 1;
    const addedCourse = {
      id: newId,
      title: newCourse.title,
      description: newCourse.description,
      detailedDescription: newCourse.detailedDescription,
      youtubeId: extractYoutubeId(newCourse.youtubeUrl),
      duration: "New",
      modules: 1,
      level: "Beginner",
      completed: false,
    };
    setVideoCourses([...videoCourses, addedCourse]);
    setIsAddCourseOpen(false);
    setNewCourse({ title: "", description: "", detailedDescription: "", youtubeUrl: "" });
    addNotification("New Course Added", `"${addedCourse.title}" is now available in the Academy.`);
    
    // Notify all users about the new course via email
    if (isAdminView) {
      api.admin.notifyNewCourse(addedCourse.title, addedCourse.detailedDescription || addedCourse.description)
        .catch(err => console.error("Failed to notify users:", err));
    }
  };

  const handleDeleteCourse = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setVideoCourses(videoCourses.filter(c => c.id !== id));
  };

  const handleEditCourseClick = (course: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCourse({
      ...course,
      youtubeUrl: `https://www.youtube.com/watch?v=${course.youtubeId}`
    });
    setIsEditCourseOpen(true);
  };

  const handleUpdateCourse = () => {
    if (!editingCourse.title || !editingCourse.youtubeUrl) return;
    setVideoCourses(videoCourses.map(c => 
      c.id === editingCourse.id 
        ? {
            ...c,
            title: editingCourse.title,
            description: editingCourse.description,
            detailedDescription: editingCourse.detailedDescription,
            youtubeId: extractYoutubeId(editingCourse.youtubeUrl),
          }
        : c
    ));
    setIsEditCourseOpen(false);
    setEditingCourse(null);
  };

  const [books, setBooks] = useState([
    {
      id: 1,
      title: "The Project Manager's Playbook",
      author: "Jane Doe",
      pages: 320,
      description: "A comprehensive guide to modern project management strategies.",
      volumeId: ""
    },
    {
      id: 2,
      title: "Navigating Legal Frameworks",
      author: "John Smith, Esq.",
      pages: 185,
      description: "Essential laws and regulations every project lead must understand.",
      volumeId: ""
    },
    {
      id: 3,
      title: "Digital Marketing Mastery",
      author: "Alex Johnson",
      pages: 250,
      description: "A complete guide to advertising, SEO, and building a brand.",
      volumeId: ""
    }
  ]);

  const extractDocumentIdOrUrl = (url: string) => {
    try {
      if (!url.includes("http")) return url;
      if (url.includes("books.google.com")) {
        const urlObj = new URL(url);
        return urlObj.searchParams.get("id") || url;
      }
      // If it's a direct PDF or other link, return the full URL
      return url;
    } catch {
      return url;
    }
  };

  const handleAddBook = () => {
    if (!newBook.title || !newBook.googleBooksUrl) return;
    const newId = books.length ? Math.max(...books.map(b => b.id)) + 1 : 1;
    setBooks([...books, {
      id: newId,
      title: newBook.title,
      author: newBook.author || "Unknown",
      pages: parseInt(newBook.pages) || 0,
      description: newBook.description,
      volumeId: extractDocumentIdOrUrl(newBook.googleBooksUrl)
    }]);
    setIsAddBookOpen(false);
    setNewBook({ title: "", author: "", description: "", pages: "", googleBooksUrl: "" });
    addNotification("New Book Added", `"${newBook.title}" is now available to read in the Academy.`);
  };

  const handleDeleteBook = (id: number) => {
    setBooks(books.filter(b => b.id !== id));
  };

  const handleEditBookClick = (book: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBook({
      ...book,
      googleBooksUrl: book.volumeId && !book.volumeId.startsWith('http') 
        ? `https://books.google.com/books?id=${book.volumeId}`
        : book.volumeId || ""
    });
    setIsEditBookOpen(true);
  };

  const handleUpdateBook = () => {
    if (!editingBook.title || !editingBook.googleBooksUrl) return;
    setBooks(books.map(b => 
      b.id === editingBook.id 
        ? {
            ...b,
            title: editingBook.title,
            author: editingBook.author,
            pages: parseInt(editingBook.pages) || 0,
            description: editingBook.description,
            volumeId: extractDocumentIdOrUrl(editingBook.googleBooksUrl),
          }
        : b
    ));
    setIsEditBookOpen(false);
    setEditingBook(null);
  };

  return (
    <div className="h-full overflow-y-auto bg-muted/20">
      <div className="container mx-auto p-6 md:p-10 max-w-6xl space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b">
          <div className="space-y-2">
            <div className="inline-flex items-center rounded-lg bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              <GraduationCap className="mr-2 h-4 w-4" />
              Corporate Training & Teaching
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
              {videoCourses.map((course) => (
                <Card key={course.id} className="flex flex-col h-full hover:shadow-md transition-all duration-300 border-border/50 overflow-hidden">
                  <div 
                    className="aspect-video bg-muted relative flex items-center justify-center group cursor-pointer overflow-hidden"
                    onClick={() => setSelectedCourse(course)}
                  >
                    <img 
                      src={`https://images.unsplash.com/photo-1516321497487-e288fb19713f?w=600&q=80`} 
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
                      <Badge variant="outline" className="text-xs bg-background">
                        {course.level}
                      </Badge>
                      <div className="flex items-center text-xs text-muted-foreground">
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
                      onClick={() => setSelectedCourse(course)}
                    >
                      {course.completed ? (
                         <> <CheckCircle2 className="h-4 w-4" /> Review Course </>
                      ) : (
                         <> <PlayCircle className="h-4 w-4" /> Start Learning </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              ))}
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
                        <Button variant="secondary" className="flex-1" title="Read the 3 key takeaways">
                          <Sparkles className="mr-2 h-4 w-4 text-amber-500" />
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
      <Dialog open={!!selectedCourse} onOpenChange={(open) => !open && setSelectedCourse(null)}>
        <DialogContent className="sm:max-w-3xl p-0 overflow-hidden bg-card/95 backdrop-blur-md border-border/50">
          {selectedCourse && (
            <div className="flex flex-col">
              {/* YouTube Embed */}
              <div className="relative aspect-video w-full bg-black">
                {selectedCourse.youtubeId ? (
                  <iframe
                    className="absolute inset-0 w-full h-full"
                    src={`https://www.youtube.com/embed/${selectedCourse.youtubeId}?autoplay=1`}
                    title={selectedCourse.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <div className="flex items-center justify-center w-full h-full text-muted-foreground">
                    No video ID provided
                  </div>
                )}
              </div>

              {/* Course Info */}
              <div className="p-6 md:p-8 space-y-4">
                <DialogHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <Badge variant="outline" className="text-xs bg-background">
                      {selectedCourse.level}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center">
                      <Clock className="mr-1 h-3 w-3" />
                      {selectedCourse.duration}
                    </span>
                  </div>
                  <DialogTitle className="text-2xl font-bold">{selectedCourse.title}</DialogTitle>
                </DialogHeader>
                
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <h4 className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">About this module</h4>
                  <p className="text-muted-foreground leading-relaxed text-sm">
                    {selectedCourse.detailedDescription}
                  </p>
                </div>

                <div className="pt-4 flex justify-end">
                  <Button onClick={() => setSelectedCourse(null)} variant="outline">
                    Close
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Course Dialog */}
      <Dialog open={isAddCourseOpen} onOpenChange={setIsAddCourseOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add New Course</DialogTitle>
            <DialogDescription>
              Add a new embedded YouTube video course with descriptions. It doesn't take up any of your storage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Course Title</Label>
              <Input 
                placeholder="e.g. Advanced QGIS Mapping" 
                value={newCourse.title}
                onChange={e => setNewCourse({...newCourse, title: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>YouTube URL or ID</Label>
              <Input 
                placeholder="e.g. https://www.youtube.com/watch?v=..." 
                value={newCourse.youtubeUrl}
                onChange={e => setNewCourse({...newCourse, youtubeUrl: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Short Description (for card)</Label>
              <Input 
                placeholder="Brief summary..." 
                value={newCourse.description}
                onChange={e => setNewCourse({...newCourse, description: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Detailed Description (for video player)</Label>
              <Textarea 
                placeholder="Explain what the video does in detail..." 
                className="h-24"
                value={newCourse.detailedDescription}
                onChange={e => setNewCourse({...newCourse, detailedDescription: e.target.value})}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsAddCourseOpen(false)}>Cancel</Button>
            <Button onClick={handleAddCourse} disabled={!newCourse.title || !newCourse.youtubeUrl}>
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
        <DialogContent className="sm:max-w-5xl p-0 h-[85vh] flex flex-col bg-card">
          <DialogHeader className="p-4 border-b shrink-0 bg-background/50 backdrop-blur flex flex-row items-center justify-between">
            <div className="space-y-1">
              <DialogTitle>{selectedBookToRead?.title}</DialogTitle>
              <DialogDescription>By {selectedBookToRead?.author}</DialogDescription>
            </div>
            {selectedBookToRead?.volumeId && selectedBookToRead.volumeId.startsWith("http") && (
              <Button variant="outline" size="sm" asChild>
                <a href={selectedBookToRead.volumeId} target="_blank" rel="noopener noreferrer">
                  Open in New Tab
                </a>
              </Button>
            )}
          </DialogHeader>
          <div className="flex-1 relative w-full h-full bg-muted/30">
            {selectedBookToRead?.volumeId ? (
              <iframe
                src={selectedBookToRead.volumeId.startsWith("http") ? selectedBookToRead.volumeId : `https://books.google.com/books?id=${selectedBookToRead.volumeId}&lpg=PP1&pg=PP1&output=embed`}
                className="w-full h-full border-0 absolute inset-0"
                allowFullScreen
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground p-8 text-center flex-col gap-4">
                <BookOpen className="w-12 h-12 opacity-20" />
                <p>This book does not have a Google Books preview available.<br/>Please add a book via the search to read it online.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {/* Edit Course Dialog */}
      <Dialog open={isEditCourseOpen} onOpenChange={setIsEditCourseOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Course</DialogTitle>
            <DialogDescription>
              Update the course details below.
            </DialogDescription>
          </DialogHeader>
          {editingCourse && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Course Title</Label>
                <Input 
                  placeholder="e.g. Advanced QGIS Mapping" 
                  value={editingCourse.title}
                  onChange={e => setEditingCourse({...editingCourse, title: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>YouTube URL or ID</Label>
                <Input 
                  placeholder="e.g. https://www.youtube.com/watch?v=..." 
                  value={editingCourse.youtubeUrl}
                  onChange={e => setEditingCourse({...editingCourse, youtubeUrl: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Short Description (for card)</Label>
                <Input 
                  placeholder="Brief summary..." 
                  value={editingCourse.description}
                  onChange={e => setEditingCourse({...editingCourse, description: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Detailed Description (for video player)</Label>
                <Textarea 
                  placeholder="Explain what the video does in detail..." 
                  className="h-24"
                  value={editingCourse.detailedDescription}
                  onChange={e => setEditingCourse({...editingCourse, detailedDescription: e.target.value})}
                />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsEditCourseOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateCourse} disabled={!editingCourse?.title || !editingCourse?.youtubeUrl}>
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
    </div>
  );
}
