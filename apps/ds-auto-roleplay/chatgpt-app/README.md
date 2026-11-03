# DS AUTO GPT 면접 리허설

최신12장 발표 뒤 CEO·COO RP16문항과 일반 면접13문항을 연습하는 본인 전용 ChatGPT 앱이다.

## ChatGPT에서 사용

배포로 생성된 개인 플러그인을 연결한 뒤 “DS AUTO 전체 리허설 시작해 줘”라고 요청한다. `start_roleplay` 다음 `show_roleplay`로 화면을 연다. 직접 답변을 제출하면 ChatGPT에 평가 메시지를 보낸다. ChatGPT는 `get_roleplay_context`의 실제 답변과 루브릭을 읽어 `record_roleplay_evaluation`으로 평가를 저장한다. 화면은 저장된 점수·개선점·면접관 반응·꼬리질문을 갱신한다.

별도 OpenAI API 키나 Responses API 호출은 사용하지 않는다. 현재 대화의 ChatGPT가 MCP 도구를 통해 평가한다. 독립 웹사이트에서는 보기 선택 연습·답변 저장·기록 조회가 가능하고, 자유 답변의 GPT 평가는 연결된 ChatGPT에서 수행한다. 평가 요청 전달이 실패하면 화면의 “GPT에 평가 요청” 또는 대화에서 “대기 중인 답변 평가해 줘”로 이어간다.

## 구성

- `content/scenarios.json`: 기존 게임에서 가져온29문항·12장 장표·평가 기준
- `src/server.js`: MCP JSON-RPC, 계정별 R2 세션 파일, 조건부 쓰기·중복 방지
- `src/widget.html`: MCP Apps UI 브리지·보기/자유답변·타이머·기록 내보내기
- `.openai/hosting.json`: 기존 Site 식별자와 R2 `BUCKET`·MCP capability
- `scripts/build.mjs`: 데이터·화면·서버를 의존성 없는 Worker ESM으로 번들
- `scripts/dev.mjs`: 관리형 미리보기 전용 Node 어댑터. QA 경로는 배포에 포함되지 않는다.

기록은 Sites가 검증해 전달한 사용자 ID를 해시한 계정별 경로에 저장한다. 요청 인자로 사용자 ID를 받지 않는다. R2 etag 조건부 쓰기와 revision·답변ID·요청ID를 검증한다. 초안만 브라우저에 임시 저장한다. 도구 결과는 다시 읽어 복구할 수 있다.

## 검증

```sh
npm run build
npm test
npm run validate
```

관리형 브라우저 QA는 `sites-preview start <checkout>`으로 띄운 미리보기의 `/__qa_bridge`에서 수행한다. 이 경로는 실제 GPT를 호출하지 않는 표준 UI 브리지 시험대다. 실계정 MCP 연결과 ChatGPT의 실제 평가 왕복은 별도 검증한다.

## 사실 구분

DS AUTO의 사흘 후속 연락·엑셀 취합·재구매30% 등은 면접용 가상 설정이다. 공개 국내 사례의 효과 범위를 넓히지 않는다. COREPRESS는6인 교육용 가상 팀 PoC다. 고객 반복 설명은 고객 맥락 단절의 결과이며 원인이 아니다.
