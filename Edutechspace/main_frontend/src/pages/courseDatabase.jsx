import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { supabase } from '../../db/Superbase-client';
import { toast } from 'react-toastify';

// Import course images
import cybersecurityImage from '../assets/images/cybersecurityImage.jpg';
import machineLearningImage from '../assets/images/machineLearningImage.jpeg';
import frontendImage from '../assets/images/frontendImage.jpg';
import backendImage from '../assets/images/backendImage.jpg';
import dataScienceImage from '../assets/images/dataScienceImage.png';
import uiuxImage from '../assets/images/uiuxImage.jpg';
import dataAnalysesImage from '../assets/images/dataAnalysesImage.jpg';
import aiImage from '../assets/images/aiImage.jpg';

const courses = [
  {
    id: 'frontend',
    title: 'Frontend Development',
    description: 'Master front-end technologies and frameworks like Web5, React.',
    image: frontendImage,
    link: '/course/frontendcourse',
    tags: ['Beginner', 'Frontend', 'React'],
    duration: '6 weeks',
    learningOutcomes: [
      'Build responsive websites with HTML, CSS, and JavaScript.',
      'Master React for dynamic user interfaces.',
      'Understand Web5 concepts for modern web development.',
    ],
  },
  {
    id: 'cybersecurity',
    title: 'Cybersecurity',
    description: 'Gain essential skills in protecting networks and data.',
    image: cybersecurityImage,
    link: '/course/cybersecuritycourse',
    tags: ['Intermediate', 'Cybersecurity'],
    duration: '8 weeks',
    learningOutcomes: [
      'Secure networks against cyber threats.',
      'Implement encryption and authentication protocols.',
      'Conduct vulnerability assessments.',
    ],
  },
  {
    id: 'machinelearning',
    title: 'Machine Learning',
    description: 'Learn how AI models are built and applied in real-world scenarios.',
    image: machineLearningImage,
    link: '/course/mlcourse',
    tags: ['Advanced', 'Machine Learning', 'AI'],
    duration: '10 weeks',
    learningOutcomes: [
      'Train machine learning models with Python.',
      'Apply ML algorithms to real-world problems.',
      'Optimize models for better performance.',
    ],
  },
  {
    id: 'datascience',
    title: 'Data Science',
    description: 'Analyze and interpret complex data to inform decisions.',
    image: dataScienceImage,
    link: '/course/datasciencecourse',
    tags: ['Intermediate', 'Data Science'],
    duration: '8 weeks',
    learningOutcomes: [
      'Clean and preprocess datasets for analysis.',
      'Use statistical methods to interpret data.',
      'Create visualizations with tools like Matplotlib.',
    ],
  },
  {
    id: 'backend',
    title: 'Backend Development',
    description: 'Understand the fundamentals and creation of RESTful APIs. Master back-end languages and frameworks like Vanilla JavaScript, Node.js, Django, PHP.',
    image: backendImage,
    link: '/course/backendcourse',
    tags: ['Intermediate', 'Backend', 'Node.js'],
    duration: '6 weeks',
    learningOutcomes: [
      'Develop RESTful APIs with Node.js.',
      'Manage databases with SQL and NoSQL.',
      'Secure back-end applications.',
    ],
  },
  {
    id: 'uiux',
    title: 'UI/UX',
    description: 'Design intuitive and engaging user interfaces and experiences.',
    image: uiuxImage,
    link: '/course/uiuxcourse',
    tags: ['Beginner', 'UI/UX', 'Design'],
    duration: '5 weeks',
    learningOutcomes: [
      'Create wireframes and prototypes with Figma.',
      'Apply UX principles for user-centered design.',
      'Design visually appealing UI components.',
    ],
  },
  {
    id: 'dataanalysis',
    title: 'Data Analyses',
    description: 'Learn techniques to process, analyze, and visualize data effectively.',
    image: dataAnalysesImage,
    link: '/course/dataanalysiscourse',
    tags: ['Intermediate', 'Data Analysis'],
    duration: '7 weeks',
    learningOutcomes: [
      'Analyze datasets using Python and Pandas.',
      'Visualize data with charts and graphs.',
      'Interpret data trends for decision-making.',
    ],
  },
  {
    id: 'ai',
    title: 'Artificial Intelligence',
    description: 'Explore the concepts and applications of AI.',
    image: aiImage,
    link: '/course/aicourse',
    tags: ['Advanced', 'AI'],
    duration: '10 weeks',
    learningOutcomes: [
      'Understand AI concepts like neural networks.',
      'Implement AI solutions with TensorFlow.',
      'Explore ethical implications of AI.',
    ],
  },
];

const courseVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.5,
      ease: 'easeInOut',
      duration: 0.5,
    },
  }),
};

const CourseDatabase = () => {
  const [hoveredCourse, setHoveredCourse] = useState(null);

  const enrollCourse = async (courseId) => {
    try {
      const { user } = (await supabase.auth.getUser()).data;
      if (!user) {
        toast.error('Please log in to enroll');
        return;
      }
      const { error } = await supabase
        .from('courses_enrolled')
        .insert({ user_id: user.id, course_id: courseId });
      if (error) {
        throw error;
      }
      toast.success('Enrolled successfully!');
    } catch (err) {
      toast.error('Failed to enroll');
      console.error(err);
    }
  };

  return (
    <section className="bg-neutral-100 py-12 md:py-24">
      <div className="container mx-auto px-4">
        <h1 className="text-6xl font-semibold tracking-tight text-neutral-900 text-center">
          Run Tech Course Database
        </h1>
        <p className="text-xl text-neutral-600 text-center mt-4">
          Discover a list of carefully picked courses with certifications to get you started on your tech journey!
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-10 relative z-0">
          {courses.map((course, index) => (
            <motion.div
              key={course.id}
              variants={courseVariants}
              initial="hidden"
              animate="visible"
              custom={index}
            >
              <div
                className="relative bg-white rounded-lg shadow-lg overflow-hidden"
                onMouseEnter={() => {
                  console.log('Hovering over course:', course.id);
                  setHoveredCourse(course.id);
                }}
                onMouseLeave={() => {
                  console.log('Leaving course:', course.id);
                  setHoveredCourse(null);
                }}
              >
                <img
                  src={course.image}
                  alt={course.title}
                  className="w-full h-48 object-cover pointer-events-none"
                />
                <div className="p-6">
                  <h3 className="text-2xl font-semibold text-neutral-900">{course.title}</h3>
                  <p className="text-neutral-600 mt-2 line-clamp-3">{course.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {course.tags.map((tag, tagIndex) => (
                      <span
                        key={tagIndex}
                        className="inline-block bg-neutral-200 text-neutral-700 text-sm px-2 py-1 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="text-neutral-600 mt-2 text-sm">Duration: {course.duration}</p>
                  <Link
                    className="inline-block mt-4 bg-neutral-900 text-white py-2 px-4 rounded-lg hover:bg-neutral-800 transition"
                    to={course.link}
                  >
                    Start Learning
                  </Link>
                </div>
                <Transition
                  show={hoveredCourse === course.id}
                  as={Fragment}
                  enter="ease-out duration-200"
                  enterFrom="opacity-0 translate-x-2"
                  enterTo="opacity-100 translate-x-0"
                  leave="ease-in duration-200"
                  leaveFrom="opacity-100 translate-x-0"
                  leaveTo="opacity-0 translate-x-2"
                >
                  <div className="absolute top-0 right-0 mr-4 w-80 bg-white rounded-lg shadow-lg p-6 z-20 md:top-0 md:right-0 md:mr-4 sm:top-full sm:left-0 sm:right-auto sm:mt-4 sm:mr-0">
                    <h4 className="text-lg font-semibold text-neutral-900">{course.title}</h4>
                    <h5 className="text-md font-medium text-neutral-700 mt-3">What You'll Learn</h5>
                    <ul className="mt-2 space-y-2 text-neutral-600">
                      {course.learningOutcomes.map((outcome, outcomeIndex) => (
                        <li key={outcomeIndex} className="flex items-start">
                          <span className="mr-2">•</span>
                          <span>{outcome}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => enrollCourse(course.id)}
                      className="w-full mt-4 bg-blue-950 text-white py-2 rounded-lg hover:bg-slate-900 transition"
                    >
                      Enroll Now
                    </button>
                  </div>
                </Transition>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default CourseDatabase;