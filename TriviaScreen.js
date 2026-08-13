import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { authedHeaders } from "./apiClient";

const API_BASE = "https://gateway-cah4.onrender.com";
const ACCENT = "#FFD166"; // Trivia tile accent from the Glass Drawer
const GLASS_BG = "rgba(255,255,255,0.14)";
const GLASS_BORDER = "rgba(255,255,255,0.25)";

const DIFFICULTIES = [
  { key: null, label: "Any" },
  { key: "easy", label: "Easy" },
  { key: "medium", label: "Medium" },
  { key: "hard", label: "Hard" },
];

const TYPES = [
  { key: null, label: "Any" },
  { key: "multiple", label: "Multiple Choice" },
  { key: "boolean", label: "True / False" },
];

const AMOUNTS = [5, 10, 15, 20];

// Fisher-Yates, used to mix the correct answer in among the wrong ones
// and to shuffle category order isn't needed, just answers per question.
function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// onBack matches News/Art/Weather's drawer pattern.
export default function TriviaScreen({ onBack }) {
  const [phase, setPhase] = useState("setup"); // "setup" | "quiz" | "results"

  // ---- Setup state ----
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [category, setCategory] = useState(null); // null = Any Category
  const [difficulty, setDifficulty] = useState(null);
  const [type, setType] = useState(null);
  const [amount, setAmount] = useState(10);

  // ---- Quiz state ----
  const [questions, setQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [quizError, setQuizError] = useState(null);
  const [qIndex, setQIndex] = useState(0);
  const [shuffledAnswers, setShuffledAnswers] = useState([]);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [score, setScore] = useState(0);

  const cardOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    (async () => {
      try {
        const headers = await authedHeaders();
        const res = await fetch(`${API_BASE}/api/apicache/api/trivia/categories`, { headers });
        const data = await res.json();
        setCategories(data.categories || []);
      } catch (e) {
      } finally {
        setCategoriesLoading(false);
      }
    })();
  }, []);

  const buildAnswersFor = (q) => {
    if (q.type === "boolean") return ["True", "False"];
    return shuffle([q.correct_answer, ...q.incorrect_answers]);
  };

  const startQuiz = async () => {
    try {
      setLoadingQuestions(true);
      setQuizError(null);
      const params = new URLSearchParams({ amount: String(amount) });
      if (category) params.set("category", String(category));
      if (difficulty) params.set("difficulty", difficulty);
      if (type) params.set("type", type);

      const res = await fetch(`${API_BASE}/api/apicache/api/trivia/questions?${params.toString()}`, { headers: await authedHeaders() });
      const data = await res.json();
      if (!data.questions || data.questions.length === 0) {
        setQuizError("No questions available for these filters - try different settings.");
        return;
      }
      setQuestions(data.questions);
      setShuffledAnswers(buildAnswersFor(data.questions[0]));
      setQIndex(0);
      setScore(0);
      setSelectedAnswer(null);
      setPhase("quiz");
    } catch (err) {
      setQuizError(err.message || "Couldn't load questions");
    } finally {
      setLoadingQuestions(false);
    }
  };

  const currentQuestion = questions[qIndex];

  const onSelectAnswer = (answer) => {
    if (selectedAnswer) return; // already answered this question
    setSelectedAnswer(answer);
    if (answer === currentQuestion.correct_answer) {
      setScore((s) => s + 1);
    }
  };

  const goToNext = () => {
    const nextIndex = qIndex + 1;
    if (nextIndex >= questions.length) {
      setPhase("results");
      return;
    }
    cardOpacity.setValue(0);
    setQIndex(nextIndex);
    setShuffledAnswers(buildAnswersFor(questions[nextIndex]));
    setSelectedAnswer(null);
    Animated.timing(cardOpacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  };

  const playAgain = () => {
    setPhase("setup");
    setQuestions([]);
    setQIndex(0);
    setScore(0);
    setSelectedAnswer(null);
  };

  const answerStyle = (answer) => {
    if (!selectedAnswer) return styles.answerButton;
    const isCorrect = answer === currentQuestion.correct_answer;
    const isChosen = answer === selectedAnswer;
    if (isCorrect) return [styles.answerButton, styles.answerCorrect];
    if (isChosen && !isCorrect) return [styles.answerButton, styles.answerWrong];
    return [styles.answerButton, styles.answerDimmed];
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#2b2410", "#4a3d1a"]} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <TouchableOpacity onPress={phase === "setup" ? onBack : playAgain} style={styles.backButton}>
          <Text style={styles.backText}>{phase === "setup" ? "Back" : "Quit"}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Trivia</Text>
        <View style={{ width: 60 }} />
      </View>

      {phase === "setup" && (
        <ScrollView contentContainerStyle={styles.setupContent}>
          <Text style={styles.sectionLabel}>Category</Text>
          {categoriesLoading ? (
            <ActivityIndicator color="#fff" style={{ marginBottom: 20 }} />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              <TouchableOpacity
                onPress={() => setCategory(null)}
                style={[styles.chip, category === null && { backgroundColor: ACCENT, borderColor: ACCENT }]}
              >
                <Text style={[styles.chipText, category === null && styles.chipTextActive]}>Any</Text>
              </TouchableOpacity>
              {categories.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setCategory(c.id)}
                  style={[styles.chip, category === c.id && { backgroundColor: ACCENT, borderColor: ACCENT }]}
                >
                  <Text style={[styles.chipText, category === c.id && styles.chipTextActive]} numberOfLines={1}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <Text style={styles.sectionLabel}>Difficulty</Text>
          <View style={styles.chipWrap}>
            {DIFFICULTIES.map((d) => (
              <TouchableOpacity
                key={d.label}
                onPress={() => setDifficulty(d.key)}
                style={[styles.chip, difficulty === d.key && { backgroundColor: ACCENT, borderColor: ACCENT }]}
              >
                <Text style={[styles.chipText, difficulty === d.key && styles.chipTextActive]}>{d.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Type</Text>
          <View style={styles.chipWrap}>
            {TYPES.map((t) => (
              <TouchableOpacity
                key={t.label}
                onPress={() => setType(t.key)}
                style={[styles.chip, type === t.key && { backgroundColor: ACCENT, borderColor: ACCENT }]}
              >
                <Text style={[styles.chipText, type === t.key && styles.chipTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Number of questions</Text>
          <View style={styles.chipWrap}>
            {AMOUNTS.map((a) => (
              <TouchableOpacity
                key={a}
                onPress={() => setAmount(a)}
                style={[styles.chip, amount === a && { backgroundColor: ACCENT, borderColor: ACCENT }]}
              >
                <Text style={[styles.chipText, amount === a && styles.chipTextActive]}>{a}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {!!quizError && <Text style={styles.errorText}>{quizError}</Text>}

          <TouchableOpacity onPress={startQuiz} style={styles.startButton} disabled={loadingQuestions}>
            {loadingQuestions ? (
              <ActivityIndicator color="#2b2410" />
            ) : (
              <Text style={styles.startButtonText}>Start Quiz</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      {phase === "quiz" && currentQuestion && (
        <View style={styles.quizContent}>
          <View style={styles.progressRow}>
            <Text style={styles.progressText}>
              Question {qIndex + 1} / {questions.length}
            </Text>
            <Text style={styles.progressText}>Score: {score}</Text>
          </View>

          <Animated.View style={[styles.questionCard, { opacity: cardOpacity }]}>
            <Text style={styles.questionCategory}>
              {currentQuestion.category} \u00b7 {currentQuestion.difficulty}
            </Text>
            <Text style={styles.questionText}>{currentQuestion.question}</Text>
          </Animated.View>

          <View style={styles.answersWrap}>
            {shuffledAnswers.map((answer, i) => (
              <TouchableOpacity key={i} style={answerStyle(answer)} onPress={() => onSelectAnswer(answer)}>
                <Text style={styles.answerText}>{answer}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {selectedAnswer && (
            <TouchableOpacity onPress={goToNext} style={styles.nextButton}>
              <Text style={styles.nextButtonText}>
                {qIndex + 1 >= questions.length ? "See Results" : "Next Question"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {phase === "results" && (
        <View style={styles.resultsContent}>
          <Text style={styles.resultsScore}>
            {score} / {questions.length}
          </Text>
          <Text style={styles.resultsLabel}>
            {Math.round((score / questions.length) * 100)}% correct
          </Text>
          <TouchableOpacity onPress={playAgain} style={styles.startButton}>
            <Text style={styles.startButtonText}>Play Again</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 12,
  },
  backButton: { width: 60 },
  backText: { color: "#fff", fontWeight: "600" },
  title: { color: "#fff", fontSize: 20, fontWeight: "700" },

  setupContent: { paddingHorizontal: 20, paddingBottom: 150 },
  sectionLabel: { color: "#fff", fontSize: 14, fontWeight: "700", marginTop: 16, marginBottom: 10 },
  chipRow: { flexGrow: 0, marginBottom: 4 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: GLASS_BG,
    borderWidth: 1, borderColor: GLASS_BORDER, marginRight: 8, maxWidth: 200,
  },
  chipText: { color: "#fff", fontWeight: "600", fontSize: 12 },
  chipTextActive: { color: "#2b2410" },

  errorText: { color: "#FF8A8A", fontSize: 13, marginTop: 16, textAlign: "center" },

  startButton: {
    backgroundColor: ACCENT, borderRadius: 24, paddingVertical: 16, alignItems: "center", marginTop: 28,
  },
  startButtonText: { color: "#2b2410", fontWeight: "800", fontSize: 15 },

  quizContent: { flex: 1, paddingHorizontal: 20 },
  progressRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  progressText: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: "600" },

  questionCard: {
    backgroundColor: GLASS_BG, borderWidth: 1, borderColor: GLASS_BORDER,
    borderRadius: 18, padding: 20, marginBottom: 24,
  },
  questionCategory: { color: ACCENT, fontSize: 11, fontWeight: "700", marginBottom: 10, textTransform: "uppercase" },
  questionText: { color: "#fff", fontSize: 18, fontWeight: "700", lineHeight: 25 },

  answersWrap: { gap: 12 },
  answerButton: {
    backgroundColor: GLASS_BG, borderWidth: 1, borderColor: GLASS_BORDER,
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16,
  },
  answerCorrect: { backgroundColor: "rgba(107,203,119,0.3)", borderColor: "#6BCB77" },
  answerWrong: { backgroundColor: "rgba(255,107,107,0.3)", borderColor: "#FF6B6B" },
  answerDimmed: { opacity: 0.5 },
  answerText: { color: "#fff", fontSize: 15, fontWeight: "600" },

  nextButton: { backgroundColor: ACCENT, borderRadius: 20, paddingVertical: 14, alignItems: "center", marginTop: 20 },
  nextButtonText: { color: "#2b2410", fontWeight: "700" },

  resultsContent: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  resultsScore: { color: "#fff", fontSize: 48, fontWeight: "800" },
  resultsLabel: { color: "rgba(255,255,255,0.8)", fontSize: 16, marginTop: 8, marginBottom: 30 },
});
