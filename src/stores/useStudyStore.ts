/** 学：课程/作业/考试 store */
import {
  courseRepo,
  examRepo,
  homeworkRepo,
} from '../repositories/study-repo'
import type { Course, Exam, Homework } from '../types/entities'
import { createCrudStore } from './factory'

export const useCourseStore = createCrudStore<Course>(courseRepo)
export const useHomeworkStore = createCrudStore<Homework>(homeworkRepo)
export const useExamStore = createCrudStore<Exam>(examRepo)
