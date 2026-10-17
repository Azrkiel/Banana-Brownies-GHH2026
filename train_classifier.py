import pickle
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

# 1. Load data
with open('data.pickle', 'rb') as f:
    data_dict = pickle.load(f)

data = np.asarray(data_dict['data'])
labels = np.asarray(data_dict['labels'])

# 2. Split into training and testing sets
x_train, x_test, y_train, y_test = train_test_split(
    data,
    labels,
    test_size=0.2,
    shuffle=True,
    stratify=labels
)

# 3. Train the Random Forest Model
model = RandomForestClassifier()
model.fit(x_train, y_train)

# 4. Check accuracy
y_predict = model.predict(x_test)
score = accuracy_score(y_predict, y_test)
print(f'{score * 100:.2f}% of samples were classified correctly!')

# 5. Save the trained model
with open('model.p', 'wb') as f:
    pickle.dump({'model': model}, f)

print("Saved model to model.p successfully!")