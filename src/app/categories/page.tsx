"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Folder } from "lucide-react";
import { motion } from "framer-motion";
import { PageWrapper, staggerContainer, staggerItem } from "@/components/motion";

export default function CategoriesPage() {
  const { data: categories, isLoading } = trpc.category.list.useQuery();

  if (isLoading) {
    return (
      <div className="container py-6">
        <h1 className="text-2xl font-bold mb-6">分类</h1>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <PageWrapper>
      <div className="container py-6">
        <motion.h1 
          className="text-2xl font-bold mb-6"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          分类
        </motion.h1>

        {categories && categories.length > 0 ? (
          <motion.div 
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {categories.map((category, index) => (
              <motion.div 
                key={category.id}
                variants={staggerItem}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.2 }}
              >
                <Link href={`/category/${category.slug}`}>
                  <Card className="hover:bg-accent transition-colors h-full cursor-pointer">
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <motion.div
                          initial={{ rotate: -10, opacity: 0 }}
                          animate={{ rotate: 0, opacity: 1 }}
                          transition={{ delay: index * 0.05 + 0.2 }}
                        >
                          <Folder className="h-5 w-5 text-primary" />
                        </motion.div>
                        <CardTitle className="text-lg">{category.name}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <CardDescription>
                        {category._count.videos} 个视频
                      </CardDescription>
                      {category.description && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                          {category.description}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <motion.div 
            className="text-center py-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <p className="text-muted-foreground">暂无分类</p>
          </motion.div>
        )}
      </div>
    </PageWrapper>
  );
}
