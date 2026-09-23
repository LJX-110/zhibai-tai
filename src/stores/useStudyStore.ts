/** 学：课程 / 停课 / 调课 / 作业 / 考试 store */
import {
  courseCancellationRepo,
  courseRepo,
  courseRescheduleRepo,
  examRepo,
  homeworkRepo,
} from '../repositories/study-repo'
import type { Course, CourseCancellation, CourseReschedule, Exam, Homework } from '../types/entities'
import { createCrudStore } from './factory'

export const useCourseStore = createCrudStore<Course>(courseRepo)
/** 单次停课：与课程分开存 —— 停课是「某一天的某一次」，不是课程的属性 */
export const useCourseCancellationStore = createCrudStore<CourseCancellation>(courseCancellationRepo)
/** 单次调课：与停课分开存 —— "这次不上"与"这次挪到别处上"是两件事，见 CourseReschedule 注释 */
export const useCourseRescheduleStore = createCrudStore<CourseReschedule>(courseRescheduleRepo)
export const useHomeworkStore = createCrudStore<Homework>(homeworkRepo)
export const useExamStore = createCrudStore<Exam>(examRepo)
