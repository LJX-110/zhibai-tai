/** 学：课程/作业/考试 数据访问 */
import { db } from '../db/db'
import type { Course, Exam, Homework } from '../types/entities'
import { createRepository } from './repo'

export const courseRepo = createRepository<Course>(db.courses)
export const homeworkRepo = createRepository<Homework>(db.homeworks)
export const examRepo = createRepository<Exam>(db.exams)
